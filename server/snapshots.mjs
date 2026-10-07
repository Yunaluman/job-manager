import { createHash } from 'node:crypto'
import { openSync, writeFileSync, fsyncSync, closeSync, unlinkSync } from 'node:fs'
import Database from 'better-sqlite3'
import { assertDatabaseIntegrity, PUBLIC_FIELDS } from './credentials.mjs'

const checksum = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function exportSnapshot(db, settings) {
  assertDatabaseIntegrity(db)
  return db.transaction(() => {
    const payload = {
      revision: db.prepare('SELECT revision FROM persistence_revision WHERE singleton = 1').get().revision,
      applications: db.prepare('SELECT data FROM applications ORDER BY id').all().map((row) => JSON.parse(row.data)),
      analyses: db.prepare('SELECT data FROM analyses ORDER BY id').all().map((row) => JSON.parse(row.data)),
      settings: Object.fromEntries(PUBLIC_FIELDS.filter((field) => typeof settings[field] === 'string').map((field) => [field, settings[field]])),
    }
    return { format: 'jobpilot-portable', version: 1, exportedAt: new Date().toISOString(), checksum: checksum(payload), payload }
  })()
}

export function validateSnapshot(snapshot) {
  if (!snapshot || snapshot.format !== 'jobpilot-portable' || snapshot.version !== 1 || !snapshot.payload || snapshot.checksum !== checksum(snapshot.payload)) throw new Error('Invalid snapshot or checksum.')
  const { revision, applications, analyses, settings } = snapshot.payload
  if (!Number.isSafeInteger(revision) || revision < 0 || !settings || Array.isArray(settings) || typeof settings !== 'object' || Object.entries(settings).some(([field, value]) => !PUBLIC_FIELDS.includes(field) || typeof value !== 'string' || value.length > 100000)) throw new Error('Invalid snapshot settings.')
  for (const rows of [applications, analyses]) {
    if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row) || typeof row.id !== 'string' || !row.id) || new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error('Invalid snapshot rows.')
  }
  return snapshot.payload
}

// Portable restores always create a new database; credentials require separate setup.
export function restoreSnapshot(snapshot, destination) {
  const payload = validateSnapshot(snapshot)
  const db = new Database(':memory:')
  let bytes
  try {
    db.exec(`CREATE TABLE applications (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE analyses (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE persistence_revision (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), revision INTEGER NOT NULL);`)
    db.transaction(() => {
      for (const table of ['applications', 'analyses']) {
        const insert = db.prepare(`INSERT INTO ${table} VALUES (?, ?)`)
        for (const row of payload[table]) insert.run(row.id, JSON.stringify(row))
      }
      db.prepare('INSERT INTO settings VALUES (?, ?)').run('main', JSON.stringify(payload.settings))
      db.prepare('INSERT INTO persistence_revision VALUES (1, ?)').run(payload.revision)
    })()
    assertDatabaseIntegrity(db)
    bytes = db.serialize()
  } finally { db.close() }
  // Exclusive creation prevents overwriting even if another process races this restore.
  const descriptor = openSync(destination, 'wx', 0o600)
  try {
    writeFileSync(descriptor, bytes)
    fsyncSync(descriptor)
  } catch (error) {
    closeSync(descriptor)
    unlinkSync(destination)
    throw error
  }
  closeSync(descriptor)
  const restored = new Database(destination, { readonly: true, fileMustExist: true })
  try {
    assertDatabaseIntegrity(restored)
    const actual = exportSnapshot(restored, JSON.parse(restored.prepare("SELECT value FROM settings WHERE key = 'main'").get().value))
    if (actual.checksum !== snapshot.checksum) throw new Error('Restored data mismatch.')
  } finally { restored.close() }
  return { applications: payload.applications.length, analyses: payload.analyses.length, revision: payload.revision }
}
