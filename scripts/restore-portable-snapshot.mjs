import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { restoreSnapshot } from '../server/snapshots.mjs'

const [source, destination] = process.argv.slice(2)
if (!source || !destination) throw new Error('Usage: node scripts/restore-portable-snapshot.mjs snapshot.json NEW_DATABASE.db')
try {
  const result = restoreSnapshot(JSON.parse(readFileSync(resolve(source), 'utf8')), resolve(destination))
  console.log(JSON.stringify({ restored: true, ...result, credentialsIncluded: false }))
} catch {
  console.error('Restore failed. Existing databases are never overwritten.')
  process.exitCode = 1
}
