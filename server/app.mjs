import express from 'express'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createCredentialStore, assertDatabaseIntegrity, PUBLIC_FIELDS, PROVIDERS, providerForUrl } from './credentials.mjs'
import { createWriteCoordinator } from './writes.mjs'
import { exportSnapshot } from './snapshots.mjs'
import { createEncryptedBackup } from './backups.mjs'
import { createMonitoring, initializeMonitoring, PURPOSES } from './ai-monitoring.mjs'
import { validateApplicationEvents } from '../src/application-events.mjs'
import { previewRegister, reconcileRegister, validateRegisterProjection } from './register-csv.mjs'
import { initializeActions, planningSnapshot, registerActionRoutes } from './actions.mjs'

export function initializeDatabase(db) {
  db.pragma('secure_delete = ON')
  db.pragma('synchronous = FULL')
  db.exec(`CREATE TABLE IF NOT EXISTS applications (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS analyses (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`)
  initializeMonitoring(db)
  initializeActions(db)
}
export function createApp({ db, protector, port, development = false, fetchProvider = fetch, backupDirectory }) {
  assertDatabaseIntegrity(db)
  initializeDatabase(db)
  const credentials = createCredentialStore(db, protector)
  credentials.migrate()
  const writes = createWriteCoordinator(db)
  const monitoring = createMonitoring(db)
  function writeRequest(req) {
    const supplied = req.get('X-JobPilot-Revision')
    const expectedRevision = supplied && /^(0|[1-9]\d*)$/.test(supplied) ? Number(supplied) : NaN
    return {
      operation: req.get('X-JobPilot-Operation'), expectedRevision,
      method: req.method, path: req.path, body: req.body,
    }
  }
  function confirmWrite(req, res, mutate) {
    const acknowledgement = writes.commit(writeRequest(req), mutate)
    res.json(acknowledgement)
  }
  const token = randomBytes(32).toString('hex')
  const origins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`])
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`])
  const app = express()
  app.disable('x-powered-by')
  app.use((req, res, next) => {
    const scriptSources = development ? "'self' 'unsafe-inline'" : "'self'"
    const connectSources = development ? "'self' ws://127.0.0.1:* ws://localhost:*" : "'self'"
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': `default-src 'self'; script-src ${scriptSources}; style-src 'self' 'unsafe-inline'; connect-src ${connectSources}; img-src 'self' data:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'` })
    if (!hosts.has(req.headers.host) || (req.headers.origin && !origins.has(req.headers.origin)) || ['cross-site', 'same-site'].includes(req.headers['sec-fetch-site'])) return res.status(403).json({ error: 'Accès local refusé.' })
    next()
  })
  app.use('/api', (req, res, next) => {
    const supplied = req.get('X-JobPilot-Session') ?? ''
    const bytes = Buffer.from(supplied)
    if (bytes.length !== token.length || !timingSafeEqual(bytes, Buffer.from(token))) return res.status(401).json({ error: 'Session locale requise. Recharge la page.' })
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) return res.status(415).json({ error: 'JSON requis.' })
    next()
  })
  // Same bootstrap capability as the HTML page, guarded by Host/Origin above.
  app.get('/local-session', (_req, res) => res.json({ token }))
  app.use('/api', express.json({ limit: '10mb' }))
  registerActionRoutes(app, db, confirmWrite)
  app.get('/api/export', (_req, res) => res.json(exportSnapshot(db, credentials.settings())))
  let backupRunning = false
  app.post('/api/backups', async (_req, res, next) => {
    if (!backupDirectory) return res.status(503).json({ error: 'Répertoire de sauvegarde indisponible.' })
    if (backupRunning) return res.status(409).json({ error: 'Une sauvegarde est déjà en cours.' })
    backupRunning = true
    try { res.json(await createEncryptedBackup(db, protector, backupDirectory)) }
    catch (error) { next(error) }
    finally { backupRunning = false }
  })
  app.get('/api/state', (_req, res) => {
    const state = db.transaction(() => ({
      revision: writes.revision(),
      ...planningSnapshot(db),
      applications: db.prepare('SELECT data FROM applications').all().map((row) => JSON.parse(row.data)),
      analyses: db.prepare('SELECT data FROM analyses').all().map((row) => JSON.parse(row.data)),
      settings: credentials.settings(),
      aiConfig: monitoring.config(),
    }))()
    res.json(state)
  })
  const applicationRows = () => db.prepare('SELECT data FROM applications').all().map((row) => JSON.parse(row.data))
  app.post('/api/register/preview', (req, res) => {
    if (!req.body || Object.keys(req.body).some((key) => !['csv', 'sourceName'].includes(key))) return res.status(400).json({ error: 'Aperçu invalide.' })
    const preview = db.transaction(() => ({ ...previewRegister(req.body.csv, applicationRows(), req.body.sourceName), revision: writes.revision() }))()
    res.json(preview)
  })
  app.post('/api/register/import', async (req, res, next) => {
    try {
      if (!req.body || Object.keys(req.body).some((key) => !['csv', 'sourceName', 'resolutions'].includes(key))) throw Object.assign(new Error('Import invalide.'), { status: 400 })
      // Preflight prevents needless backups on stale requests or receipt replays. Commit rechecks after await.
      const previous = writes.preflight(writeRequest(req))
      if (previous) return res.json(previous)
      const preview = previewRegister(req.body.csv, applicationRows(), req.body.sourceName)
      const changes = reconcileRegister(preview, applicationRows(), req.body.resolutions)
      changes.forEach(validateRegisterProjection)
      changes.forEach(validateApplicationEvents)
      if (!backupDirectory || backupRunning) return res.status(409).json({ error: 'Sauvegarde préalable indisponible. Aucun import effectué.' })
      backupRunning = true
      let backup
      try { backup = await createEncryptedBackup(db, protector, backupDirectory) }
      finally { backupRunning = false }
      if (!backup.verified) throw new Error('Backup readback was not verified.')
      confirmWrite(req, res, () => {
        const upsert = db.prepare('INSERT INTO applications (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
        changes.forEach((application) => upsert.run(application.id, JSON.stringify(application)))
        return { applications: applicationRows(), imported: changes.length, backupVerified: true }
      })
    } catch (error) { next(error) }
  })
  for (const table of ['applications', 'analyses']) {
    const assertWritable = (id, body) => {
      if (table !== 'applications') return
      const previous = db.prepare('SELECT data FROM applications WHERE id = ?').get(id)
      if (body?.register !== undefined || (previous && JSON.parse(previous.data).register)) throw Object.assign(new Error('Dossier issu du CSV en lecture seule. Modifie le registre puis importe son aperçu.'), { status: 400 })
    }
    const validateLink = (item) => {
      if (table !== 'analyses' || item.applicationId === undefined) return
      if (typeof item.applicationId !== 'string' || !item.applicationId || item.applicationId.length > 200) throw Object.assign(new Error('Lien de candidature invalide.'), { status: 400 })
      if (db.prepare('SELECT id FROM applications WHERE id = ?').get(item.applicationId)) return
      const previous = db.prepare('SELECT data FROM analyses WHERE id = ?').get(item.id)
      // Keep historical links after a candidature is deleted, without allowing new orphan links.
      if (previous && JSON.parse(previous.data).applicationId === item.applicationId) return
      throw Object.assign(new Error('Candidature liée introuvable. Synchronise les données.'), { status: 400 })
    }
    const upsert = db.prepare(`INSERT INTO ${table} (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`)
    app.get(`/api/${table}`, (_req, res) => res.json(db.prepare(`SELECT data FROM ${table}`).all().map((row) => JSON.parse(row.data))))
    app.put(`/api/${table}/:id`, (req, res) => {
      if (!req.body || Array.isArray(req.body) || req.body.id !== req.params.id) return res.status(400).json({ error: 'Identifiant invalide.' })
      if (table === 'applications') validateApplicationEvents(req.body)
      confirmWrite(req, res, () => { assertWritable(req.params.id, req.body); validateLink(req.body); upsert.run(req.params.id, JSON.stringify(req.body)); return req.body })
    })
    app.delete(`/api/${table}/:id`, (req, res) => {
      confirmWrite(req, res, () => { assertWritable(req.params.id); db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(req.params.id); return { id: req.params.id } })
    })
    app.put(`/api/${table}`, (req, res) => {
      if (!Array.isArray(req.body) || req.body.some((item) => !item || typeof item.id !== 'string' || !item.id)) return res.status(400).json({ error: 'Liste invalide.' })
      if (new Set(req.body.map((item) => item.id)).size !== req.body.length) return res.status(400).json({ error: 'Identifiants dupliqués.' })
      if (table === 'applications') req.body.forEach(validateApplicationEvents)
      confirmWrite(req, res, () => {
        if (table === 'applications' && applicationRows().some((application) => application.register)) throw Object.assign(new Error('Le remplacement global supprimerait des projections du registre. Import refusé.'), { status: 400 })
        req.body.forEach((item) => assertWritable(item.id, item))
        req.body.forEach(validateLink)
        db.prepare(`DELETE FROM ${table}`).run()
        for (const item of req.body) upsert.run(item.id, JSON.stringify(item))
        return req.body
      })
    })
  }
  app.get('/api/settings', (_req, res) => res.json(credentials.settings()))
  app.put('/api/settings', (req, res) => {
    const body = req.body
    if (!body || Array.isArray(body) || Object.entries(body).some(([key, value]) => !PUBLIC_FIELDS.includes(key) || typeof value !== 'string' || value.length > 100000)) return res.status(400).json({ error: 'Réglages invalides.' })
    if (body.baseUrl !== undefined && !providerForUrl(body.baseUrl)) return res.status(400).json({ error: 'Fournisseur non autorisé.' })
    confirmWrite(req, res, () => { credentials.updateSettings(body); return credentials.settings() })
  })
  app.post('/api/settings/migrate', (req, res) => {
    const body = req.body
    const allowed = [...PUBLIC_FIELDS, 'keys', 'apiKey', 'mistralKey']
    if (!body || Array.isArray(body) || Object.keys(body).some((key) => !allowed.includes(key)) || Object.entries(body).some(([key, value]) => key !== 'keys' && (typeof value !== 'string' || value.length > 100000))) return res.status(400).json({ error: 'Migration invalide.' })
    if (body.keys !== undefined && (!body.keys || Array.isArray(body.keys) || typeof body.keys !== 'object' || Object.values(body.keys).some((key) => typeof key !== 'string' || key.length > 4096))) return res.status(400).json({ error: 'Clés invalides.' })
    confirmWrite(req, res, () => { credentials.migrate(body); return credentials.settings() })
  })
  app.put('/api/credentials/:provider', (req, res) => {
    if (!Object.hasOwn(PROVIDERS, req.params.provider) || typeof req.body?.key !== 'string' || !req.body.key.trim() || req.body.key.length > 4096 || /[\r\n]/.test(req.body.key) || Object.keys(req.body).length !== 1) return res.status(400).json({ error: 'Clé ou fournisseur invalide.' })
    confirmWrite(req, res, () => { credentials.set(req.params.provider, req.body.key.trim()); return credentials.settings() })
  })
  app.delete('/api/credentials/:provider', (req, res) => {
    if (!Object.hasOwn(PROVIDERS, req.params.provider)) return res.status(400).json({ error: 'Fournisseur invalide.' })
    confirmWrite(req, res, () => { credentials.remove(req.params.provider); return credentials.settings() })
  })
  let inFlight = false
  app.get('/api/ai/activity', (req, res) => res.json(monitoring.history(req.query)))
  app.get('/api/ai/summary', (req, res) => res.json(monitoring.aggregate(req.query)))
  app.get('/api/ai/budget', (_req, res) => res.json(monitoring.budget()))
  app.get('/api/ai/config', (_req, res) => res.json(monitoring.config()))
  app.put('/api/ai/config', (req, res) => confirmWrite(req, res, () => monitoring.setBudget(req.body)))
  app.post('/api/ai/tariffs', (req, res) => confirmWrite(req, res, () => monitoring.addTariff(req.body)))
  app.post('/api/ai', async (req, res) => {
    const { prompt, baseUrl, model, purpose, maxTokens = 1600, temperature = 0.3 } = req.body ?? {}
    const provider = providerForUrl(baseUrl)
    if (!provider || !PURPOSES.includes(purpose) || typeof prompt !== 'string' || !prompt.trim() || prompt.length > 30000 || typeof model !== 'string' || !/^[\w./:-]{1,120}$/.test(model) || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 2000 || ![0, 0.3].includes(temperature) || Object.keys(req.body).some((key) => !['prompt', 'baseUrl', 'model', 'purpose', 'maxTokens', 'temperature'].includes(key))) return res.status(400).json({ error: 'Requête IA invalide.' })
    if (inFlight) return res.status(429).json({ error: 'Un appel IA est déjà en cours.' })
    const key = credentials.get(provider)
    if (!key) return res.status(400).json({ error: 'Aucune clé pour ce fournisseur.' })
    if (model.includes(key)) return res.status(400).json({ error: 'Modèle invalide.' })
    // Refuse dispatch if the durable attempt cannot be committed and read back.
    let attempt
    try { attempt = monitoring.begin({ purpose, provider, model }) }
    catch { return res.status(503).json({ error: 'Journal IA indisponible. Aucun appel fournisseur envoyé.' }) }
    inFlight = true
    let outcome = { status: 'uncertain', errorKind: 'transport' }, reply = { error: 'Appel fournisseur interrompu ou indisponible.' }, httpStatus = 502
    try {
      const result = await fetchProvider(`${PROVIDERS[provider]}/chat/completions`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(45000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature, max_tokens: maxTokens, ...(provider === 'mistral' ? { service_tier: 'standard_only' } : {}) }),
      })
      if (!result.ok) {
        const response = await result.json().catch(() => undefined)
        outcome = { status: 'error', errorKind: 'provider', response }
        reply = { error: result.status === 401 ? 'Clé API invalide ou expirée.' : `Le fournisseur a refusé la requête (${result.status}).` }
      } else {
        const response = await result.json()
        const content = response?.choices?.[0]?.message?.content
        if (typeof content !== 'string' || content.length > 100000 || content.includes(key)) {
          outcome = { status: 'error', errorKind: 'response', response }
          reply = { error: 'Réponse du fournisseur invalide.' }
        } else { outcome = { status: 'success', response }; reply = { content }; httpStatus = 200 }
      }
    } catch (error) {
      outcome = error instanceof SyntaxError ? { status: 'error', errorKind: 'response' } : { status: 'uncertain', errorKind: ['TimeoutError', 'AbortError'].includes(error?.name) ? 'timeout' : 'transport' }
    } finally {
      try { monitoring.finish(attempt, { ...outcome, secret: key }) }
      catch {
        // Keep the original pending row: never retry a paid call on a logging error.
        reply = { ...reply, monitoringWarning: 'Résultat du journal non confirmé ; coût inconnu. Ne relance pas cet appel pour cette raison.' }
      }
      inFlight = false
    }
    res.status(httpStatus).json(reply)
  })
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Route inconnue.' }))
  app.use((err, _req, res, _next) => {
    // Never log request bodies, provider exceptions, or credential subprocess output.
    if ([400, 409].includes(err.status) && !err.type) return res.status(err.status).json({ error: err.message })
    res.status(err.type === 'entity.parse.failed' ? 400 : err.type === 'entity.too.large' ? 413 : 500).json({ error: 'Opération locale impossible ; aucune confirmation de sauvegarde.' })
  })
  return { app, token, credentials, acceptsHostAndOrigin: (headers) => hosts.has(headers.host) && (!headers.origin || origins.has(headers.origin)) }
}
