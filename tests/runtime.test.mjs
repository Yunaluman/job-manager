import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, readdirSync, readFileSync, unlinkSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'

async function reservePort() {
  const server = createServer()
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  return { server, port: server.address().port }
}
function launch(folder, port, dev = false) {
  const child = spawn(process.execPath, ['server/index.mjs', ...(dev ? ['--dev'] : [])], { env: { ...process.env, JOBPILOT_DATA_DIR: folder, JOBPILOT_PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (bytes) => { output += bytes })
  child.stderr.on('data', (bytes) => { output += bytes })
  const ended = new Promise((done) => child.once('exit', (code) => done(code)))
  const ready = new Promise((done, reject) => {
    const timeout = setTimeout(() => reject(new Error('Runtime startup timeout')), 20000)
    child.stdout.on('data', () => { if (output.includes('local session ready')) { clearTimeout(timeout); done() } })
    child.once('exit', () => { clearTimeout(timeout); reject(new Error('Runtime exited before ready')) })
  })
  ready.catch(() => {})
  return { child, ready, ended }
}
function clean(folder) {
  // Only delete files in the exact directory created by this test.
  for (const entry of readdirSync(folder)) unlinkSync(join(folder, entry))
  rmdirSync(folder)
}
test('production runtime bootstraps its session and serves guarded API and HTML routes', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'jobpilot-runtime-'))
  const reserved = await reservePort()
  await new Promise((done) => reserved.server.close(done))
  const runtime = launch(folder, reserved.port)
  try {
    await runtime.ready
    const base = `http://127.0.0.1:${reserved.port}`
    const html = await (await fetch(base)).text()
    const token = html.match(/name="jobpilot-session" content="([a-f0-9]{64})"/)?.[1]
    assert.ok(token)
    const directHtml = await (await fetch(`${base}/index.html`)).text()
    assert.ok(directHtml.includes(token))
    assert.equal((await fetch(`${base}/api/settings`)).status, 401)
    const settings = await fetch(`${base}/api/settings`, { headers: { 'X-JobPilot-Session': token } })
    assert.equal(settings.status, 200)
    assert.equal((await settings.json()).keys, undefined)
    assert.equal((await fetch(base, { headers: { Origin: 'https://attacker.example' } })).status, 403)
    assert.equal((await fetch(`${base}/profil`)).status, 200)
    const csp = settings.headers.get('content-security-policy')
    assert.match(csp, /script-src 'self';/)
  } finally {
    runtime.child.kill('SIGTERM')
    await runtime.ended
    clean(folder)
  }
})
test('occupied port fails before migrating or creating user data', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'jobpilot-collision-'))
  const file = join(folder, 'jobpilot.db')
  const db = new Database(file)
  db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  db.prepare("INSERT INTO settings VALUES ('main', ?)").run('{"mistralKey":"fixture-original"}')
  db.close()
  const before = readFileSync(file)
  const reserved = await reservePort()
  const runtime = launch(folder, reserved.port)
  try {
    assert.equal(await runtime.ended, 1)
    assert.deepEqual(readFileSync(file), before)
    assert.deepEqual(readdirSync(folder), ['jobpilot.db'])
    assert.equal(reserved.server.listening, true)
  } finally {
    if (runtime.child.exitCode === null) { runtime.child.kill(); await runtime.ended }
    await new Promise((done) => reserved.server.close(done))
    clean(folder)
  }
})
