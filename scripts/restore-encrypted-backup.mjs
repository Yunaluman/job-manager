import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { restoreEncryptedBackup } from '../server/backups.mjs'
import { createWindowsProtector } from '../server/credentials.mjs'
const [source, destination] = process.argv.slice(2)
if (!source || !destination) throw new Error('Usage: node scripts/restore-encrypted-backup.mjs backup.json NEW_DATABASE.db')
try {
  const metadata = restoreEncryptedBackup(JSON.parse(readFileSync(resolve(source), 'utf8')), createWindowsProtector(), resolve(destination))
  console.log(JSON.stringify({ restored: true, ...metadata }))
} catch {
  console.error('Restore failed. Same Windows account required; existing databases are never overwritten.')
  process.exitCode = 1
}
