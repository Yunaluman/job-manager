// Read-only comparison with a DPAPI recovery snapshot; output metadata only.
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { createWindowsProtector, publicFields } from '../server/credentials.mjs'

const [liveFile, recoveryFile] = process.argv.slice(2)
const protector = createWindowsProtector()
const snapshot = JSON.parse(readFileSync(recoveryFile, 'utf8'))
const bytes = Buffer.from(protector.unprotect(snapshot.encrypted), 'base64')
// SQLite memory databases cannot use a WAL journal. Only adjust the memory copy's journal flags.
bytes[18] = 1
bytes[19] = 1
const before = new Database(bytes)
const after = new Database(liveFile, { readonly: true, fileMustExist: true })
try {
  const old = JSON.parse(before.prepare("SELECT value FROM settings NOT INDEXED WHERE key = 'main'").get()?.value ?? '{}')
  const current = JSON.parse(after.prepare("SELECT value FROM settings NOT INDEXED WHERE key = 'main'").get()?.value ?? '{}')
  const tableCounts = Object.fromEntries(['applications', 'analyses'].map((table) => [table, { before: before.prepare(`SELECT data FROM ${table} NOT INDEXED`).all().length, after: after.prepare(`SELECT data FROM ${table} NOT INDEXED`).all().length }]))
  const credentialsVerified = Object.entries(old.keys ?? {}).every(([provider, value]) => {
    const row = after.prepare('SELECT encrypted FROM credentials WHERE provider = ?').get(provider)
    return row && protector.unprotect(row.encrypted) === value
  })
  const logicalDataPreserved = ['applications', 'analyses'].every((table) => {
    const rows = (db) => db.prepare(`SELECT id, data FROM ${table} NOT INDEXED`).all().sort((a, b) => a.id.localeCompare(b.id))
    return JSON.stringify(rows(before)) === JSON.stringify(rows(after))
  })
  const integrity = after.pragma('integrity_check')
  const databaseIntegrityOk = integrity.length === 1 && integrity[0].integrity_check === 'ok'
  const profileAndCvPreserved = JSON.stringify(publicFields(old)) === JSON.stringify(publicFields(current))
  const plaintextFieldsRemoved = !['keys', 'apiKey', 'mistralKey'].some((key) => Object.hasOwn(current, key))
  const liveBytes = readFileSync(liveFile)
  const noKeyInCurrentDatabaseFile = Object.values(old.keys ?? {}).every((key) => typeof key === 'string' && !liveBytes.includes(Buffer.from(key)))
  console.log(JSON.stringify({ tableCounts, databaseIntegrityOk, credentialsVerified, logicalDataPreserved, profileAndCvPreserved, plaintextFieldsRemoved, noKeyInCurrentDatabaseFile, protectedProviders: after.prepare('SELECT provider FROM credentials').all().map((row) => row.provider) }))
  if (![databaseIntegrityOk, credentialsVerified, logicalDataPreserved, profileAndCvPreserved, plaintextFieldsRemoved, noKeyInCurrentDatabaseFile].every(Boolean)) process.exitCode = 1
} finally { before.close(); after.close() }
