// Serveur local JobPilot — persistance SQLite.
// Écoute uniquement sur 127.0.0.1 : inaccessible depuis le réseau.
// Base : %LOCALAPPDATA%\JobPilot\jobpilot.db (survit au navigateur, facile à sauvegarder).
import express from 'express'
import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

const dataDir = process.env.LOCALAPPDATA
  ? join(process.env.LOCALAPPDATA, 'JobPilot')
  : join(os.homedir(), '.jobpilot')
mkdirSync(dataDir, { recursive: true })
const dbPath = join(dataDir, 'jobpilot.db')

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.exec(`
  CREATE TABLE IF NOT EXISTS applications (id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS analyses (id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`)

const app = express()
app.use(express.json({ limit: '10mb' }))

// --- Fabrique de routes CRUD identiques pour applications et analyses ---
function crud(table) {
  const list = db.prepare(`SELECT data FROM ${table}`)
  const upsert = db.prepare(`INSERT INTO ${table} (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`)
  const remove = db.prepare(`DELETE FROM ${table} WHERE id = ?`)
  const clear = db.prepare(`DELETE FROM ${table}`)
  const replaceAll = db.transaction((items) => {
    clear.run()
    for (const item of items) upsert.run(item.id, JSON.stringify(item))
  })

  app.get(`/api/${table}`, (_req, res) => {
    res.json(list.all().map((r) => JSON.parse(r.data)))
  })
  app.put(`/api/${table}/:id`, (req, res) => {
    upsert.run(req.params.id, JSON.stringify(req.body))
    res.json({ ok: true })
  })
  app.delete(`/api/${table}/:id`, (req, res) => {
    remove.run(req.params.id)
    res.json({ ok: true })
  })
  // Remplacement complet (import JSON / migration depuis localStorage)
  app.put(`/api/${table}`, (req, res) => {
    if (!Array.isArray(req.body)) return res.status(400).json({ error: 'array attendu' })
    replaceAll(req.body)
    res.json({ ok: true, count: req.body.length })
  })
}

crud('applications')
crud('analyses')

const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?')
const setSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')

app.get('/api/settings', (_req, res) => {
  const row = getSetting.get('main')
  res.json(row ? JSON.parse(row.value) : {})
})
app.put('/api/settings', (req, res) => {
  const row = getSetting.get('main')
  const merged = { ...(row ? JSON.parse(row.value) : {}), ...req.body }
  setSetting.run('main', JSON.stringify(merged))
  res.json({ ok: true })
})

const PORT = 3001
const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`[jobpilot] API SQLite sur http://127.0.0.1:${PORT} — base : ${dbPath}`)
})
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[jobpilot] ERREUR : le port ${PORT} est déjà utilisé — une autre instance tourne probablement.\n` +
        `[jobpilot] Pour la trouver et l'arrêter (PowerShell) :\n` +
        `[jobpilot]   Get-NetTCPConnection -LocalPort ${PORT} -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`,
    )
  } else {
    console.error('[jobpilot] Erreur serveur :', err)
  }
  process.exit(1)
})
