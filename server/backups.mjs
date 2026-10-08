import Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, openSync, fsyncSync, closeSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { assertDatabaseIntegrity } from './credentials.mjs'

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
function inspect(bytes) {
  const memoryBytes = Buffer.from(bytes)
  // A standalone online backup may retain WAL mode in its file header.
  memoryBytes[18] = 1
  memoryBytes[19] = 1
  const db = new Database(memoryBytes)
  try {
    assertDatabaseIntegrity(db)
    return {
      revision: db.prepare('SELECT revision FROM persistence_revision WHERE singleton = 1').get().revision,
      applications: db.prepare('SELECT COUNT(*) AS count FROM applications').get().count,
      analyses: db.prepare('SELECT COUNT(*) AS count FROM analyses').get().count,
    }
  } finally { db.close() }
}

export function decodeBackup(envelope, protector) {
  if (!envelope || envelope.format !== 'jobpilot-dpapi-sqlite' || envelope.version !== 1 || typeof envelope.encrypted !== 'string') throw new Error('Invalid encrypted backup.')
  const recovered = JSON.parse(protector.unprotect(envelope.encrypted))
  const bytes = Buffer.from(recovered.sqlite, 'base64')
  if (recovered.checksum !== digest(bytes)) throw new Error('Backup checksum mismatch.')
  const metadata = inspect(bytes)
  if (JSON.stringify(metadata) !== JSON.stringify(recovered.metadata)) throw new Error('Backup metadata mismatch.')
  return { bytes, metadata }
}

export async function createEncryptedBackup(db, protector, directory) {
  assertDatabaseIntegrity(db)
  mkdirSync(directory, { recursive: true })
  const id = randomUUID()
  const temporary = join(directory, `${id}.temporary.db`)
  const pending = join(directory, `${id}.pending.json`)
  const destination = join(directory, `${id}.backup.json`)
  let published = false
  let destinationCreated = false
  try {
    await db.backup(temporary)
    const bytes = readFileSync(temporary)
    const metadata = inspect(bytes)
    const envelope = { format: 'jobpilot-dpapi-sqlite', version: 1,
      encrypted: protector.protect(JSON.stringify({ sqlite: bytes.toString('base64'), checksum: digest(bytes), metadata })) }
    const descriptor = openSync(pending, 'wx', 0o600)
    try { writeFileSync(descriptor, JSON.stringify(envelope)); fsyncSync(descriptor) }
    finally { closeSync(descriptor) }
    const verified = decodeBackup(JSON.parse(readFileSync(pending, 'utf8')), protector)
    if (!verified.bytes.equals(bytes)) throw new Error('Persisted backup differs from source.')
    // Publish without replacement; only verified ciphertext becomes a named backup.
    const finalDescriptor = openSync(destination, 'wx', 0o600)
    destinationCreated = true
    try { writeFileSync(finalDescriptor, readFileSync(pending)); fsyncSync(finalDescriptor) }
    finally { closeSync(finalDescriptor) }
    if (!decodeBackup(JSON.parse(readFileSync(destination, 'utf8')), protector).bytes.equals(bytes)) throw new Error('Published backup verification failed.')
    published = true
    return { verified: true, path: destination, ...metadata }
  } finally {
    for (const path of [temporary, `${temporary}-wal`, `${temporary}-shm`, pending]) if (existsSync(path)) unlinkSync(path)
    if (destinationCreated && !published && existsSync(destination)) unlinkSync(destination)
  }
}

export function restoreEncryptedBackup(envelope, protector, destination) {
  const { bytes, metadata } = decodeBackup(envelope, protector)
  const descriptor = openSync(destination, 'wx', 0o600)
  let success = false
  try {
    writeFileSync(descriptor, bytes)
    fsyncSync(descriptor)
    if (!readFileSync(destination).equals(bytes)) throw new Error('Restored bytes differ.')
    success = true
  } finally {
    closeSync(descriptor)
    if (!success) unlinkSync(destination)
  }
  return metadata
}
