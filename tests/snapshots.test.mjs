import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initializeDatabase } from '../server/app.mjs'
import { createWriteCoordinator } from '../server/writes.mjs'
import { exportSnapshot, restoreSnapshot, validateSnapshot } from '../server/snapshots.mjs'
import { createWindowsProtector } from '../server/credentials.mjs'
import { createEncryptedBackup, restoreEncryptedBackup } from '../server/backups.mjs'
import { createMonitoring, monitoringSnapshot } from '../server/ai-monitoring.mjs'

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'jobpilot-snapshot-'))
  const db = new Database(join(directory, 'source.db'))
  db.pragma('journal_mode = WAL')
  initializeDatabase(db)
  createWriteCoordinator(db)
  db.prepare('INSERT INTO applications VALUES (?, ?)').run('app', JSON.stringify({ id: 'app', company: 'Fixture', eventHistoryComplete: false,
    events: [{ id: 'sent', kind: 'sent', occurredAt: '2026-01-01', source: 'manual' }, { id: 'interview', kind: 'interview', occurredAt: '2026-01-05', source: 'manual' }] }))
  db.prepare('INSERT INTO analyses VALUES (?, ?)').run('analysis', JSON.stringify({ id: 'analysis', applicationId: 'app', result: 'Fixture analysis' }))
  const settings = { cvText: 'Fixture CV', profileName: 'Fixture Name', keys: { mistral: 'never-export-this' }, keyStatus: { mistral: true } }
  t.after(() => {
    db.close()
    for (const name of readdirSync(directory)) unlinkSync(join(directory, name))
    rmdirSync(directory)
  })
  return { db, directory, settings }
}

test('complete portable snapshot includes live WAL data, excludes credentials, and restores exactly', (t) => {
  const { db, directory, settings } = fixture(t)
  const snapshot = exportSnapshot(db, settings)
  assert.equal(JSON.stringify(snapshot).includes('never-export-this'), false)
  assert.equal(Object.hasOwn(snapshot.payload.settings, 'keyStatus'), false)
  assert.equal(snapshot.payload.settings.cvText, settings.cvText)
  assert.equal(snapshot.payload.applications.length, 1)
  assert.equal(snapshot.payload.analyses.length, 1)
  const destination = join(directory, 'restored.db')
  assert.deepEqual(restoreSnapshot(snapshot, destination), { applications: 1, analyses: 1, revision: 0 })
  const restored = new Database(destination, { readonly: true })
  try {
    assert.deepEqual(exportSnapshot(restored, snapshot.payload.settings).payload, snapshot.payload)
    assert.equal(restored.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name = 'credentials'").get().count, 0)
  } finally { restored.close() }
  assert.throws(() => restoreSnapshot(snapshot, destination), { code: 'EEXIST' })
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM applications').get().count, 1)
})

test('tampered backups fail before creating a destination', (t) => {
  const { db, directory, settings } = fixture(t)
  const snapshot = exportSnapshot(db, settings)
  snapshot.payload.settings.cvText = 'tampered'
  const destination = join(directory, 'invalid.db')
  assert.throws(() => restoreSnapshot(snapshot, destination))
  assert.equal(existsSync(destination), false)
  assert.throws(() => validateSnapshot({ ...snapshot, version: 2 }))
})

test('v1 restoration preserves dated milestones, links and untouched legacy incomplete histories', (t) => {
  const { db, directory, settings } = fixture(t)
  const legacy = { id: 'legacy', status: 'refusee', appliedAt: '2025-01-01', history: [{ date: '2025-02-01', event: 'old unstructured note' }] }
  db.prepare('INSERT INTO applications VALUES (?, ?)').run(legacy.id, JSON.stringify(legacy))
  const snapshot = exportSnapshot(db, settings, 1)
  const destination = join(directory, 'v1-events-restored.db')
  restoreSnapshot(snapshot, destination)
  const restored = new Database(destination, { readonly: true })
  try {
    assert.deepEqual(exportSnapshot(restored, snapshot.payload.settings, 1).payload, snapshot.payload)
    assert.deepEqual(JSON.parse(restored.prepare('SELECT data FROM applications WHERE id = ?').get('legacy').data), legacy)
    assert.equal(JSON.parse(restored.prepare('SELECT data FROM analyses').get().data).applicationId, 'app')
  } finally { restored.close() }
})

test('real DPAPI online backup restores WAL data and protected credentials', { skip: process.platform !== 'win32' }, async (t) => {
  const { db, directory } = fixture(t)
  const monitoring = createMonitoring(db)
  monitoring.finish(monitoring.begin({ purpose: 'cv-analysis', provider: 'mistral', model: 'fixture-model' }), { status: 'uncertain', errorKind: 'timeout', secret: 'fixture-secret' })
  monitoring.setBudget({ monthlyLimitCents: 1500 })
  const originalMonitoring = monitoringSnapshot(db)
  const protector = createWindowsProtector()
  db.exec('CREATE TABLE credentials (provider TEXT PRIMARY KEY, encrypted TEXT NOT NULL)')
  db.prepare('INSERT INTO credentials VALUES (?, ?)').run('mistral', protector.protect('fixture-secret'))
  const backup = await createEncryptedBackup(db, protector, directory)
  assert.equal(backup.verified, true)
  assert.equal(readdirSync(directory).some((name) => name.includes('temporary') || name.includes('pending')), false)
  const text = readFileSync(backup.path, 'utf8')
  assert.equal(text.includes('fixture-secret'), false)
  const destination = join(directory, 'encrypted-restored.db')
  const envelope = JSON.parse(text)
  assert.equal(restoreEncryptedBackup(envelope, protector, destination).applications, 1)
  const restored = new Database(destination)
  try {
    assert.equal(restored.prepare('SELECT COUNT(*) AS count FROM analyses').get().count, 1)
    assert.equal(protector.unprotect(restored.prepare('SELECT encrypted FROM credentials').get().encrypted), 'fixture-secret')
    assert.deepEqual(monitoringSnapshot(restored), originalMonitoring)
  } finally { restored.close() }
  assert.throws(() => restoreEncryptedBackup(envelope, protector, destination), { code: 'EEXIST' })
})

test('protection failure publishes no backup and removes temporary plaintext', async (t) => {
  const { db, directory } = fixture(t)
  await assert.rejects(createEncryptedBackup(db, { protect() { throw new Error('protection unavailable') } }, directory))
  assert.equal(readdirSync(directory).some((name) => name.includes('temporary') || name.includes('pending') || name.endsWith('backup.json')), false)
})

test('failed persisted-ciphertext verification leaves no published backup', async (t) => {
  const { db, directory } = fixture(t)
  await assert.rejects(createEncryptedBackup(db, { protect() { return 'fixture-ciphertext' }, unprotect() { throw new Error('cannot decrypt persisted ciphertext') } }, directory))
  assert.equal(readdirSync(directory).some((name) => name.includes('temporary') || name.includes('pending') || name.endsWith('backup.json')), false)
})
