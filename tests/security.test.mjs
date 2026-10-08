import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { createServer, request } from 'node:http'
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createApp, initializeDatabase } from '../server/app.mjs'
import { createCredentialStore, createWindowsProtector, assertDatabaseIntegrity, PROVIDERS } from '../server/credentials.mjs'

// Test-only protector: production has no fallback to this implementation.
function testProtector() {
  const key = randomBytes(32)
  return {
    protect(value) {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
      return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString('base64')
    },
    unprotect(value) {
      const bytes = Buffer.from(value, 'base64')
      const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12))
      decipher.setAuthTag(bytes.subarray(12, 28))
      return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')
    },
  }
}
function legacyDb(settings) {
  const db = new Database(':memory:')
  initializeDatabase(db)
  db.prepare("INSERT INTO settings VALUES ('main', ?)").run(JSON.stringify(settings))
  return db
}
test('migration verifies persisted ciphertext and preserves profile and analyses', () => {
  const secret = randomBytes(24).toString('hex')
  const db = legacyDb({ keys: { mistral: secret }, cvText: 'fixture CV', profileName: 'Fixture' })
  try {
    db.prepare('INSERT INTO analyses VALUES (?, ?)').run('one', '{"id":"one"}')
    const store = createCredentialStore(db, testProtector())
    store.migrate()
    assert.equal(store.get('mistral'), secret)
    assert.deepEqual(store.settings(), { cvText: 'fixture CV', profileName: 'Fixture', keyStatus: { mistral: true, zai: false } })
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM analyses').get().n, 1)
    for (const row of db.prepare('SELECT value FROM settings').all()) assert.equal(row.value.includes(secret), false)
    assert.equal(db.prepare('SELECT encrypted FROM credentials').get().encrypted.includes(secret), false)
    store.migrate()
    assert.equal(store.get('mistral'), secret)
  } finally { db.close() }
})
test('failed encryption or readback rolls back without removing plaintext', () => {
  for (const protector of [
    { protect() { throw new Error('fixture failure') }, unprotect() { return '' } },
    { protect() { return 'encrypted-fixture' }, unprotect() { return 'wrong value' } },
  ]) {
    const db = legacyDb({ mistralKey: 'fixture-secret', cvText: 'fixture' })
    try {
      const before = db.prepare('SELECT value FROM settings').get().value
      const store = createCredentialStore(db, protector)
      assert.throws(() => store.migrate())
      assert.equal(db.prepare('SELECT value FROM settings').get().value, before)
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM credentials').get().n, 0)
    } finally { db.close() }
  }
})
test('browser migration preserves current data and rejects conflicting credentials', () => {
  const db = legacyDb({ cvText: 'current' })
  try {
    const store = createCredentialStore(db, testProtector())
    store.set('mistral', 'current-secret')
    assert.throws(() => store.migrate({ keys: { mistral: 'different-secret' }, cvText: 'legacy' }))
    assert.equal(store.get('mistral'), 'current-secret')
    assert.equal(store.settings().cvText, 'current')
    store.migrate({ apiKey: 'current-secret', baseUrl: PROVIDERS.mistral })
    assert.equal(store.get('mistral'), 'current-secret')
    assert.equal(store.settings().cvText, 'current')
  } finally { db.close() }
})
test('custom legacy credentials are quarantined and malformed legacy values survive failure', () => {
  const db = legacyDb({ apiKey: 'fixture-custom-secret', baseUrl: 'https://legacy.example/v1' })
  try {
    const store = createCredentialStore(db, testProtector())
    store.migrate()
    assert.equal(store.get('custom'), 'fixture-custom-secret')
    assert.equal(store.get('mistral'), null)
    assert.equal(store.settings().keyStatus.mistral, false)
    assert.throws(() => store.migrate({ keys: { mistral: 42 } }))
    assert.throws(() => store.migrate({ keys: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`fixture${i}`, 'fixture'])) }))
    assert.throws(() => store.migrate({ keys: { 'https://unexpected.example': 'fixture' } }))
    assert.equal(store.get('custom'), 'fixture-custom-secret')
  } finally { db.close() }
})
test('failed credential replacement retains the previous protected key', () => {
  const db = legacyDb({})
  const protector = testProtector()
  try {
    const store = createCredentialStore(db, protector)
    store.set('mistral', 'fixture-old-secret')
    const validDecrypt = protector.unprotect
    protector.unprotect = () => 'wrong readback'
    assert.throws(() => store.set('mistral', 'fixture-new-secret'))
    protector.unprotect = validDecrypt
    assert.equal(store.get('mistral'), 'fixture-old-secret')
  } finally { db.close() }
})
async function fixture(t, fetchProvider) {
  const db = legacyDb({ keys: { mistral: 'fixture-provider-secret' }, baseUrl: PROVIDERS.mistral, model: 'fixture-model' })
  const server = createServer()
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const port = server.address().port
  const result = createApp({ db, protector: testProtector(), port, fetchProvider })
  server.on('request', result.app)
  t.after(async () => { server.closeAllConnections(); await new Promise((done) => server.close(done)); db.close() })
  function call(url, { method = 'GET', body, headers = {}, authenticated = true, raw } = {}) {
    return new Promise((done, reject) => {
      const req = request({ host: '127.0.0.1', port, path: url, method, headers: {
        ...(authenticated ? { 'X-JobPilot-Session': result.token } : {}),
        'X-JobPilot-Revision': String(db.prepare('SELECT revision FROM persistence_revision WHERE singleton = 1').get().revision),
        'X-JobPilot-Operation': randomUUID(),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers,
      } }, (res) => {
        let text = ''
        res.on('data', (bytes) => { text += bytes }); res.on('end', () => done({ status: res.statusCode, text, headers: res.headers }))
      })
      req.on('error', reject)
      req.end(raw ?? (body === undefined ? undefined : JSON.stringify(body)))
    })
  }
  return { ...result, call, port }
}
test('all data, credential and AI routes require session authorization', async (t) => {
  const { call } = await fixture(t)
  for (const [url, method] of [['settings', 'GET'], ['applications', 'GET'], ['analyses', 'GET'], ['settings', 'PUT'], ['settings/migrate', 'POST'], ['credentials/mistral', 'PUT'], ['credentials/mistral', 'DELETE'], ['ai', 'POST']]) {
    assert.equal((await call(`/api/${url}`, { method, authenticated: false, ...(method === 'PUT' || method === 'POST' ? { body: {} } : {}) })).status, 401)
  }
  const res = await call('/api/settings')
  assert.equal(res.status, 200)
  assert.equal(res.text.includes('fixture-provider-secret'), false)
  assert.equal(res.text.includes('encrypted'), false)
  assert.deepEqual(JSON.parse(res.text).keyStatus, { mistral: true, zai: false })
  assert.equal(res.headers['cache-control'], 'no-store')
  assert.equal(res.headers['access-control-allow-origin'], undefined)
})
test('host, origin, fetch metadata, token and content type reject hostile requests', async (t) => {
  const { call, port } = await fixture(t)
  for (const headers of [{ Host: 'attacker.example' }, { Host: `127.0.0.1:${port + 1}` }, { Origin: 'https://attacker.example' }, { Origin: 'null' }, { 'Sec-Fetch-Site': 'cross-site' }, { 'Sec-Fetch-Site': 'same-site' }]) {
    assert.equal((await call('/api/settings', { headers })).status, 403)
  }
  assert.equal((await call('/api/settings', { headers: { 'X-JobPilot-Session': 'x'.repeat(64) } })).status, 401)
  assert.equal((await call('/api/settings', { method: 'PUT', raw: '{}', headers: { 'Content-Type': 'text/plain' } })).status, 415)
  assert.equal((await call('/api/settings', { method: 'PUT', raw: '{', headers: { 'Content-Type': 'application/json' } })).status, 400)
  const bootstrap = await call('/local-session', { authenticated: false })
  assert.match(JSON.parse(bootstrap.text).token, /^[0-9a-f]{64}$/)
  assert.equal(bootstrap.headers['cache-control'], 'no-store')
  assert.equal((await call('/local-session', { authenticated: false, headers: { Origin: 'https://attacker.example' } })).status, 403)
})
test('settings reject credential fields and credentials never appear in responses', async (t) => {
  const { call } = await fixture(t)
  for (const body of [{ keys: { mistral: 'bad' } }, { apiKey: 'bad' }, { encrypted: 'bad' }, { keyStatus: {} }, { baseUrl: 'https://attacker.example/v1' }]) assert.equal((await call('/api/settings', { method: 'PUT', body })).status, 400)
  const save = await call('/api/credentials/zai', { method: 'PUT', body: { key: 'fixture-new-secret' } })
  assert.equal(save.status, 200)
  assert.equal(save.text.includes('fixture-new-secret'), false)
  assert.equal(JSON.parse(save.text).result.keyStatus.zai, true)
  assert.equal((await call('/api/credentials/custom', { method: 'PUT', body: { key: 'fixture' } })).status, 400)
  const remove = await call('/api/credentials/zai', { method: 'DELETE' })
  assert.equal(JSON.parse(remove.text).result.keyStatus.zai, false)
})

test('HTTP writes require a current revision and replay only the same operation', async (t) => {
  const { call } = await fixture(t)
  const body = { id: 'fixture-app', company: 'Fixture' }
  const operation = randomUUID()
  const headers = { 'X-JobPilot-Revision': '0', 'X-JobPilot-Operation': operation }
  assert.equal((await call('/api/applications/fixture-app', { method: 'PUT', body, headers: { 'X-JobPilot-Revision': '' } })).status, 400)
  const saved = await call('/api/applications/fixture-app', { method: 'PUT', body, headers })
  assert.equal(saved.status, 200)
  assert.deepEqual(JSON.parse(saved.text), { ok: true, revision: 1, result: body })
  const replay = await call('/api/applications/fixture-app', { method: 'PUT', body, headers })
  assert.equal(replay.text, saved.text)
  assert.equal((await call('/api/applications/fixture-app', { method: 'PUT', body: { ...body, company: 'Other' }, headers })).status, 409)
  assert.equal((await call('/api/applications/fixture-app', { method: 'DELETE', headers: { 'X-JobPilot-Revision': '0' } })).status, 409)
  const state = JSON.parse((await call('/api/state')).text)
  assert.equal(state.revision, 1)
  assert.deepEqual(state.applications, [body])
  assert.equal(JSON.stringify(state).includes('fixture-provider-secret'), false)
})
test('AI calls use server credentials, fixed destinations and no redirects', async (t) => {
  const calls = []
  const { call } = await fixture(t, async (...args) => { calls.push(args); return Response.json({ choices: [{ message: { content: 'fixture answer' } }] }) })
  const valid = { purpose: 'cv-analysis', prompt: 'fixture prompt', baseUrl: PROVIDERS.mistral, model: 'fixture-model' }
  for (const baseUrl of ['http://api.mistral.ai/v1', 'https://api.mistral.ai.attacker.example/v1', 'http://127.0.0.1:1', `${PROVIDERS.mistral}/`, 'https://user:password@api.mistral.ai/v1']) assert.equal((await call('/api/ai', { method: 'POST', body: { ...valid, baseUrl } })).status, 400)
  assert.equal((await call('/api/ai', { method: 'POST', body: { ...valid, key: 'injected' } })).status, 400)
  assert.equal(calls.length, 0)
  const res = await call('/api/ai', { method: 'POST', body: valid })
  assert.equal(res.status, 200)
  assert.deepEqual(JSON.parse(res.text), { content: 'fixture answer' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], `${PROVIDERS.mistral}/chat/completions`)
  assert.equal(calls[0][1].headers.Authorization, 'Bearer fixture-provider-secret')
  assert.equal(calls[0][1].redirect, 'error')
  assert.ok(calls[0][1].signal instanceof AbortSignal)
})
test('provider exceptions and error bodies are not relayed to the browser', async (t) => {
  const { call } = await fixture(t, async () => { throw new Error('fixture-provider-secret') })
  const res = await call('/api/ai', { method: 'POST', body: { purpose: 'cv-analysis', prompt: 'fixture', baseUrl: PROVIDERS.mistral, model: 'fixture' } })
  assert.equal(res.status, 502)
  assert.equal(res.text.includes('fixture-provider-secret'), false)
})
test('provider content echoing its credential is rejected', async (t) => {
  const { call } = await fixture(t, async () => Response.json({ choices: [{ message: { content: 'fixture-provider-secret' } }] }))
  const res = await call('/api/ai', { method: 'POST', body: { purpose: 'cv-analysis', prompt: 'fixture', baseUrl: PROVIDERS.mistral, model: 'fixture' } })
  assert.equal(res.status, 502)
  assert.equal(res.text.includes('fixture-provider-secret'), false)
})
test('concurrent paid requests are refused and no automatic retry occurs', async (t) => {
  let release
  let calls = 0
  let started
  const ready = new Promise((done) => { started = done })
  const pending = new Promise((done) => { release = done })
  const { call } = await fixture(t, async () => { calls++; started(); await pending; return Response.json({ choices: [{ message: { content: 'fixture answer' } }] }) })
  const options = { method: 'POST', body: { purpose: 'cv-analysis', prompt: 'fixture', baseUrl: PROVIDERS.mistral, model: 'fixture' } }
  const first = call('/api/ai', options)
  await ready
  try {
    assert.equal((await call('/api/ai', options)).status, 429)
    assert.equal(calls, 1)
  } finally { release() }
  assert.equal((await first).status, 200)
})
test('Windows DPAPI performs a real round trip without plaintext persistence', { skip: process.platform !== 'win32' }, () => {
  const protector = createWindowsProtector()
  const value = randomBytes(32).toString('hex')
  const ciphertext = protector.protect(value)
  assert.notEqual(ciphertext, value)
  assert.equal(protector.unprotect(ciphertext), value)
  const db = legacyDb({ keys: { mistral: value } })
  try {
    const store = createCredentialStore(db, protector)
    store.migrate()
    assert.equal(store.get('mistral'), value)
    assert.equal(db.prepare('SELECT value FROM settings').get().value.includes(value), false)
  } finally { db.close() }
})
test('offline migration creates a decryptable recovery snapshot and preserves all non-secret data', { skip: process.platform !== 'win32' }, () => {
  const folder = mkdtempSync(join(tmpdir(), 'jobpilot-security-'))
  const file = join(folder, 'fixture.db')
  const secret = randomBytes(24).toString('hex')
  const db = new Database(file)
  initializeDatabase(db)
  db.pragma('journal_mode = WAL')
  db.prepare("INSERT INTO settings VALUES ('main', ?)").run(JSON.stringify({ cvText: 'fixture CV', keys: { mistral: secret } }))
  db.prepare('INSERT INTO analyses VALUES (?, ?)').run('one', '{"id":"one","result":"fixture"}')
  db.close()
  let migrated
  let recovered
  try {
    const output = execFileSync(process.execPath, [resolve('scripts/migrate-local-credentials.mjs'), file], { encoding: 'utf8', timeout: 30000, windowsHide: true })
    const result = JSON.parse(output)
    assert.equal(result.migrated, true)
    assert.equal(result.nonSecretDataPreserved, true)
    assert.equal(output.includes(secret), false)
    const backup = JSON.parse(readFileSync(result.encryptedRecoveryCopy, 'utf8'))
    const protector = createWindowsProtector()
    // A serialized WAL database must be restored as a file, not a memory image.
    const recoveryFile = join(folder, 'recovered.db')
    writeFileSync(recoveryFile, Buffer.from(protector.unprotect(backup.encrypted), 'base64'))
    recovered = new Database(recoveryFile)
    assert.equal(JSON.parse(recovered.prepare('SELECT value FROM settings').get().value).keys.mistral, secret)
    migrated = new Database(file, { readonly: true, fileMustExist: true })
    const store = createCredentialStore(migrated, protector)
    assert.equal(store.get('mistral'), secret)
    assert.equal(JSON.parse(migrated.prepare('SELECT value FROM settings').get().value).cvText, 'fixture CV')
    assert.equal(migrated.prepare('SELECT data FROM analyses').get().data, '{"id":"one","result":"fixture"}')
  } finally {
    migrated?.close(); recovered?.close()
    for (const entry of readdirSync(folder)) unlinkSync(join(folder, entry))
    rmdirSync(folder)
  }
})
function corruptIndexFixture() {
  const db = legacyDb({ keys: { mistral: 'fixture-recovery-secret' }, cvText: 'fixture recovery CV' })
  db.prepare('INSERT INTO applications VALUES (?, ?)').run('fixture-app', '{"id":"fixture-app"}')
  db.prepare('INSERT INTO analyses VALUES (?, ?)').run('fixture-analysis', '{"id":"fixture-analysis"}')
  const pageSize = db.pragma('page_size', { simple: true })
  const roots = db.prepare("SELECT rootpage FROM sqlite_master WHERE name IN ('sqlite_autoindex_settings_1', 'sqlite_autoindex_applications_1')").all()
  const bytes = db.serialize()
  db.close()
  for (const { rootpage } of roots) {
    const offset = (rootpage - 1) * pageSize
    assert.equal(bytes[offset], 10)
    bytes.writeUInt16BE(0, offset + 1)
    bytes.writeUInt16BE(0, offset + 3)
    bytes.writeUInt16BE(pageSize, offset + 5)
    bytes[offset + 7] = 0
  }
  return bytes
}
test('corrupt indexes fail closed before automatic migration can hide or delete source data', () => {
  const db = new Database(corruptIndexFixture())
  try {
    assert.throws(() => assertDatabaseIntegrity(db))
    const original = db.prepare('SELECT rowid, key, value FROM settings NOT INDEXED').all()
    assert.throws(() => createApp({ db, protector: testProtector(), port: 34567 }))
    assert.deepEqual(db.prepare('SELECT rowid, key, value FROM settings NOT INDEXED').all(), original)
    assert.equal(db.prepare('SELECT data FROM applications NOT INDEXED').all().length, 1)
  } finally { db.close() }
})
test('explicit index recovery preserves physical source rows and verifies encryption before reconciliation', { skip: process.platform !== 'win32' }, () => {
  const folder = mkdtempSync(join(tmpdir(), 'jobpilot-index-recovery-'))
  const file = join(folder, 'fixture.db')
  const recoveryFile = join(folder, 'fixture.credentials.json')
  const originalBytes = corruptIndexFixture()
  const protector = createWindowsProtector()
  let db
  try {
    writeFileSync(file, originalBytes)
    writeFileSync(recoveryFile, JSON.stringify({ format: 'jobpilot-dpapi-sqlite-v1', encrypted: protector.protect(originalBytes.toString('base64')) }))
    db = new Database(file)
    // Reproduce the empty duplicate caused by an indexed lookup missing its source row.
    db.prepare("INSERT INTO settings VALUES ('main', '{}')").run()
    db.close(); db = undefined
    const output = execFileSync(process.execPath, [resolve('scripts/repair-indexes-and-migrate.mjs'), file, recoveryFile], { encoding: 'utf8', timeout: 30000, windowsHide: true })
    const result = JSON.parse(output)
    assert.equal(result.repairedAndMigrated, true)
    assert.equal(result.integrity, 'ok')
    assert.equal(result.applications, 1)
    assert.equal(result.analyses, 1)
    assert.equal(output.includes('fixture-recovery-secret'), false)
    db = new Database(file)
    assertDatabaseIntegrity(db)
    const store = createCredentialStore(db, protector)
    assert.equal(store.get('mistral'), 'fixture-recovery-secret')
    assert.equal(store.settings().cvText, 'fixture recovery CV')
    assert.equal(db.prepare('SELECT data FROM applications').get().data, '{"id":"fixture-app"}')
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM settings').get().n, 1)
  } finally {
    db?.close()
    for (const entry of readdirSync(folder)) unlinkSync(join(folder, entry))
    rmdirSync(folder)
  }
})
