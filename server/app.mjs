import express from 'express'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createCredentialStore, assertDatabaseIntegrity, PUBLIC_FIELDS, PROVIDERS, providerForUrl } from './credentials.mjs'

export function initializeDatabase(db) {
  db.pragma('secure_delete = ON')
  db.exec(`CREATE TABLE IF NOT EXISTS applications (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS analyses (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`)
}
export function createApp({ db, protector, port, development = false, fetchProvider = fetch }) {
  assertDatabaseIntegrity(db)
  initializeDatabase(db)
  const credentials = createCredentialStore(db, protector)
  credentials.migrate()
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
  app.use('/api', express.json({ limit: '10mb' }))
  for (const table of ['applications', 'analyses']) {
    const upsert = db.prepare(`INSERT INTO ${table} (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`)
    app.get(`/api/${table}`, (_req, res) => res.json(db.prepare(`SELECT data FROM ${table}`).all().map((row) => JSON.parse(row.data))))
    app.put(`/api/${table}/:id`, (req, res) => {
      if (!req.body || Array.isArray(req.body) || req.body.id !== req.params.id) return res.status(400).json({ error: 'Identifiant invalide.' })
      upsert.run(req.params.id, JSON.stringify(req.body)); res.json({ ok: true })
    })
    app.delete(`/api/${table}/:id`, (req, res) => { db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(req.params.id); res.json({ ok: true }) })
    app.put(`/api/${table}`, (req, res) => {
      if (!Array.isArray(req.body) || req.body.some((item) => !item || typeof item.id !== 'string' || !item.id)) return res.status(400).json({ error: 'Liste invalide.' })
      db.transaction(() => { db.prepare(`DELETE FROM ${table}`).run(); for (const item of req.body) upsert.run(item.id, JSON.stringify(item)) })()
      res.json({ ok: true, count: req.body.length })
    })
  }
  app.get('/api/settings', (_req, res) => res.json(credentials.settings()))
  app.put('/api/settings', (req, res) => {
    const body = req.body
    if (!body || Array.isArray(body) || Object.entries(body).some(([key, value]) => !PUBLIC_FIELDS.includes(key) || typeof value !== 'string' || value.length > 100000)) return res.status(400).json({ error: 'Réglages invalides.' })
    if (body.baseUrl !== undefined && !providerForUrl(body.baseUrl)) return res.status(400).json({ error: 'Fournisseur non autorisé.' })
    credentials.updateSettings(body); res.json(credentials.settings())
  })
  app.post('/api/settings/migrate', (req, res) => {
    const body = req.body
    const allowed = [...PUBLIC_FIELDS, 'keys', 'apiKey', 'mistralKey']
    if (!body || Array.isArray(body) || Object.keys(body).some((key) => !allowed.includes(key)) || Object.entries(body).some(([key, value]) => key !== 'keys' && (typeof value !== 'string' || value.length > 100000))) return res.status(400).json({ error: 'Migration invalide.' })
    if (body.keys !== undefined && (!body.keys || Array.isArray(body.keys) || typeof body.keys !== 'object' || Object.values(body.keys).some((key) => typeof key !== 'string' || key.length > 4096))) return res.status(400).json({ error: 'Clés invalides.' })
    credentials.migrate(body); res.json(credentials.settings())
  })
  app.put('/api/credentials/:provider', (req, res) => {
    if (!Object.hasOwn(PROVIDERS, req.params.provider) || typeof req.body?.key !== 'string' || !req.body.key.trim() || req.body.key.length > 4096 || /[\r\n]/.test(req.body.key) || Object.keys(req.body).length !== 1) return res.status(400).json({ error: 'Clé ou fournisseur invalide.' })
    credentials.set(req.params.provider, req.body.key.trim()); res.json(credentials.settings())
  })
  app.delete('/api/credentials/:provider', (req, res) => {
    if (!Object.hasOwn(PROVIDERS, req.params.provider)) return res.status(400).json({ error: 'Fournisseur invalide.' })
    credentials.remove(req.params.provider); res.json(credentials.settings())
  })
  let inFlight = false
  app.post('/api/ai', async (req, res) => {
    const { prompt, baseUrl, model, maxTokens = 1600, temperature = 0.3 } = req.body ?? {}
    const provider = providerForUrl(baseUrl)
    if (!provider || typeof prompt !== 'string' || !prompt.trim() || prompt.length > 30000 || typeof model !== 'string' || !/^[\w./:-]{1,120}$/.test(model) || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 2000 || ![0, 0.3].includes(temperature) || Object.keys(req.body).some((key) => !['prompt', 'baseUrl', 'model', 'maxTokens', 'temperature'].includes(key))) return res.status(400).json({ error: 'Requête IA invalide.' })
    if (inFlight) return res.status(429).json({ error: 'Un appel IA est déjà en cours.' })
    const key = credentials.get(provider)
    if (!key) return res.status(400).json({ error: 'Aucune clé pour ce fournisseur.' })
    inFlight = true
    try {
      const result = await fetchProvider(`${PROVIDERS[provider]}/chat/completions`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(45000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature, max_tokens: maxTokens }),
      })
      if (!result.ok) return res.status(502).json({ error: result.status === 401 ? 'Clé API invalide ou expirée.' : `Le fournisseur a refusé la requête (${result.status}).` })
      const content = (await result.json()).choices?.[0]?.message?.content
      if (typeof content !== 'string' || content.length > 100000 || content.includes(key)) return res.status(502).json({ error: 'Réponse du fournisseur invalide.' })
      res.json({ content })
    } catch { res.status(502).json({ error: 'Appel fournisseur interrompu ou indisponible.' }) }
    finally { inFlight = false }
  })
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Route inconnue.' }))
  app.use((err, _req, res, _next) => {
    // Never log request bodies, provider exceptions, or credential subprocess output.
    res.status(err.type === 'entity.parse.failed' ? 400 : err.type === 'entity.too.large' ? 413 : 500).json({ error: 'Opération locale impossible ; aucune confirmation de sauvegarde.' })
  })
  return { app, token, credentials, acceptsHostAndOrigin: (headers) => hosts.has(headers.host) && (!headers.origin || origins.has(headers.origin)) }
}
