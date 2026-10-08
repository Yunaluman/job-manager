// Explicit offline migration. Never output personal data, keys or ciphertext.
import Database from 'better-sqlite3'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { createCredentialStore, createWindowsProtector, publicFields, assertDatabaseIntegrity } from '../server/credentials.mjs'
import { initializeDatabase } from '../server/app.mjs'

const file = process.argv[2]
if (!file) throw new Error('Pass the explicit database path. Stop JobPilot first.')
const dbPath = resolve(file)
const db = new Database(dbPath, { fileMustExist: true, timeout: 1000 })
try {
  assertDatabaseIntegrity(db)
  const protector = createWindowsProtector()
  // A consistent snapshot includes WAL changes. The on-disk recovery copy is encrypted.
  const snapshot = db.serialize().toString('base64')
  const protectedSnapshot = protector.protect(snapshot)
  const backup = `${dbPath}.${Date.now()}.credentials.json`
  writeFileSync(backup, JSON.stringify({ format: 'jobpilot-dpapi-sqlite-v1', encrypted: protectedSnapshot }), { flag: 'wx', mode: 0o600 })
  const persisted = JSON.parse(readFileSync(backup, 'utf8')).encrypted
  if (protector.unprotect(persisted) !== snapshot) throw new Error('Recovery snapshot verification failed.')
  initializeDatabase(db)
  const store = createCredentialStore(db, protector)
  const dataDigest = () => createHash('sha256').update(JSON.stringify({
    applications: db.prepare('SELECT id, data FROM applications ORDER BY id').all(),
    analyses: db.prepare('SELECT id, data FROM analyses ORDER BY id').all(),
    settings: publicFields(JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'main'").get()?.value ?? '{}')),
  })).digest('hex')
  const beforeDigest = dataDigest()
  const beforeCounts = ['applications', 'analyses'].map((table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n)
  store.migrate()
  const settings = JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'main'").get()?.value ?? '{}')
  if (['keys', 'apiKey', 'mistralKey'].some((key) => Object.hasOwn(settings, key))) throw new Error('Plaintext settings still exist.')
  for (const row of db.prepare('SELECT provider FROM credentials').all()) if (!store.get(row.provider)) throw new Error('Credential readback failed.')
  const afterCounts = ['applications', 'analyses'].map((table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n)
  if (JSON.stringify(beforeCounts) !== JSON.stringify(afterCounts)) throw new Error('Record counts changed.')
  if (dataDigest() !== beforeDigest) throw new Error('Non-secret data changed.')
  const checkpoint = db.pragma('wal_checkpoint(TRUNCATE)')[0]
  console.log(JSON.stringify({ migrated: true, encryptedRecoveryCopy: backup, keyStatus: store.settings().keyStatus, nonSecretDataPreserved: true, checkpointComplete: checkpoint.busy === 0 }))
} catch {
  console.error('Credential migration did not complete. Source data and any encrypted recovery snapshot were preserved; inspect locally without printing secrets.')
  process.exitCode = 1
} finally { db.close() }
