// Explicit recovery for the index-only corruption found during this audit.
// The pre-migration DPAPI snapshot is authoritative; no secret values are printed.
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { createWindowsProtector, createCredentialStore, publicFields, assertDatabaseIntegrity } from '../server/credentials.mjs'

const [liveFile, recoveryFile] = process.argv.slice(2)
if (!liveFile || !recoveryFile) throw new Error('Pass the live database and encrypted recovery snapshot paths. Stop JobPilot first.')
const protector = createWindowsProtector()
const recovery = JSON.parse(readFileSync(recoveryFile, 'utf8'))
if (recovery.format !== 'jobpilot-dpapi-sqlite-v1') throw new Error('Unsupported recovery snapshot.')
const bytes = Buffer.from(protector.unprotect(recovery.encrypted), 'base64')
bytes[18] = 1
bytes[19] = 1
const source = new Database(bytes)
const db = new Database(liveFile, { fileMustExist: true, timeout: 1000 })
try {
  const issues = db.pragma('integrity_check').map((row) => row.integrity_check)
  if (!issues.every((issue) => /^(?:wrong # of entries in index sqlite_autoindex_(?:applications|settings)_1|row \d+ missing from index sqlite_autoindex_(?:applications|settings)_1)$/.test(issue))) throw new Error('Corruption is not limited to the expected indexes.')
  const rows = (connection, table) => connection.prepare(`SELECT rowid, * FROM ${table} NOT INDEXED`).all()
  for (const table of ['applications', 'analyses']) {
    if (JSON.stringify(rows(source, table)) !== JSON.stringify(rows(db, table))) throw new Error('Application or analysis data changed since the snapshot.')
  }
  const originalSettings = rows(source, 'settings')
  if (originalSettings.length !== 1 || originalSettings[0].key !== 'main') throw new Error('Unexpected original settings.')
  const original = originalSettings[0]
  const currentSettings = rows(db, 'settings')
  if (!currentSettings.some((row) => JSON.stringify(row) === JSON.stringify(original))) throw new Error('Original settings are not preserved.')
  const extra = currentSettings.filter((row) => row.rowid !== original.rowid)
  if (extra.length > 1 || extra.some((row) => row.key !== 'main' || row.value !== '{}')) throw new Error('Unexpected extra settings; manual reconciliation required.')
  const legacy = JSON.parse(original.value)
  db.pragma('secure_delete = ON')
  const store = createCredentialStore(db, protector)
  if (db.prepare('SELECT provider FROM credentials NOT INDEXED').all().length) throw new Error('Protected credentials already exist; manual reconciliation required.')
  // Encrypt and verify every source key before deleting either settings row.
  db.transaction(() => {
    const keys = { ...(legacy.keys ?? {}) }
    if (legacy.apiKey || legacy.mistralKey) throw new Error('This recovery expects the verified per-provider source format.')
    for (const [provider, value] of Object.entries(keys)) {
      if (typeof value !== 'string' || !value) throw new Error('Malformed recovery key.')
      store.set(provider, value)
      if (store.get(provider) !== value) throw new Error('Recovery credential verification failed.')
    }
    db.prepare('DELETE FROM settings').run()
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('main', JSON.stringify(publicFields(legacy)))
    db.exec('REINDEX sqlite_autoindex_applications_1; REINDEX sqlite_autoindex_settings_1;')
    assertDatabaseIntegrity(db)
    for (const table of ['applications', 'analyses']) {
      if (JSON.stringify(rows(source, table)) !== JSON.stringify(rows(db, table))) throw new Error('Recovered data mismatch.')
    }
    if (JSON.stringify(store.settings().cvText) !== JSON.stringify(legacy.cvText)) throw new Error('CV preservation failed.')
  }).immediate()
  const checkpoint = db.pragma('wal_checkpoint(TRUNCATE)')[0]
  console.log(JSON.stringify({ repairedAndMigrated: true, integrity: 'ok', applications: rows(db, 'applications').length, analyses: rows(db, 'analyses').length, keyStatus: store.settings().keyStatus, checkpointComplete: checkpoint.busy === 0 }))
} catch {
  console.error('Recovery did not complete. Source rows and encrypted snapshot remain available. No confirmation of migration.')
  process.exitCode = 1
} finally { source.close(); db.close() }
