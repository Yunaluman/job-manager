import Database from 'better-sqlite3'
import express from 'express'
import { createServer } from 'node:http'
import { mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import os from 'node:os'
import { createApp } from './app.mjs'
import { createWindowsProtector } from './credentials.mjs'

const development = process.argv.includes('--dev')
const port = Number(process.env.JOBPILOT_PORT ?? (development ? 5173 : 3001))
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local port.')
const dataDir = process.env.JOBPILOT_DATA_DIR ?? (process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'JobPilot') : join(os.homedir(), '.jobpilot'))
mkdirSync(dataDir, { recursive: true })
let db
let vite
const server = createServer()
const starting = (_req, res) => {
  res.writeHead(503, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' })
  res.end('JobPilot démarre. Réessaie dans quelques instants.')
}
server.on('request', starting)
let closing = false
async function close(code = 0) {
  if (closing) return
  closing = true
  server.closeAllConnections()
  await new Promise((done) => server.close(done))
  await vite?.close()
  db?.close()
  process.exitCode = code
}
process.once('SIGINT', () => void close())
process.once('SIGTERM', () => void close())
try {
  // Reserve the port before opening or migrating the user's database.
  await new Promise((done, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', done)
  })
  db = new Database(join(dataDir, 'jobpilot.db'))
  db.pragma('journal_mode = WAL')
  const { app, token, acceptsHostAndOrigin } = createApp({ db, protector: createWindowsProtector(), port, development })
  server.prependListener('upgrade', (req, socket) => {
    if (!acceptsHostAndOrigin(req.headers)) socket.destroy()
  })
  const inject = (html) => html.replace('</head>', `<meta name="jobpilot-session" content="${token}"></head>`)
  if (development) {
    const { createServer: createViteServer } = await import('vite')
    vite = await createViteServer({ server: { middlewareMode: true, hmr: { server } }, appType: 'custom' })
    app.use(vite.middlewares)
    app.use(async (req, res, next) => {
      if (req.method !== 'GET' || !req.accepts('html')) return next()
      try {
        const html = await vite.transformIndexHtml(req.originalUrl, readFileSync(resolve('index.html'), 'utf8'))
        res.type('html').send(inject(html))
      } catch { res.status(500).send('Page indisponible.') }
    })
  } else {
    app.use((req, res, next) => {
      if (req.path.endsWith('.html')) return next()
      express.static(resolve('dist'), { index: false })(req, res, next)
    })
    app.use((req, res, next) => {
      if (req.method !== 'GET' || !req.accepts('html')) return next()
      res.type('html').send(inject(readFileSync(resolve('dist/index.html'), 'utf8')))
    })
  }
  app.use((_err, _req, res, _next) => res.status(500).send('Opération locale impossible.'))
  server.removeListener('request', starting)
  server.on('request', app)
  console.log(`[jobpilot] http://127.0.0.1:${port} — local session ready`)
} catch {
  console.error('[jobpilot] Startup failed. Check the port, build and Windows credential access. Existing services were not reused or stopped.')
  await close(1)
}
