// Read-only audit. Never print secret values or personal record contents.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import Database from 'better-sqlite3'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
const patterns = [
  /\b(?:sk-(?:proj-|ant-)?|ghp_|github_pat_|AKIA|AIza)[A-Za-z0-9_-]{16,}/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /(?:api[_-]?key|secret|password|access[_-]?token)\s*["']?\s*[:=]\s*["']([^"'\r\n]{20,})["']/gi,
]
function scan(text, location) {
  for (const [index, pattern] of patterns.entries()) {
    pattern.lastIndex = 0
    for (const match of text.matchAll(pattern)) {
      console.log(JSON.stringify({ candidate: location, line: text.slice(0, match.index).split('\n').length, rule: index + 1 }))
    }
  }
}
let fileCount = 0
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist'].includes(item.name)) continue
    const file = path.join(dir, item.name)
    if (item.isDirectory()) walk(file)
    else if (item.isFile() && fs.statSync(file).size < 2 * 1024 * 1024) {
      fileCount++
      scan(fs.readFileSync(file, 'utf8'), file)
      if (/^\.env(?:\.|$)|\.(?:pem|key|db|sqlite|sqlite3)$/i.test(item.name)) console.log(JSON.stringify({ sensitiveFile: file }))
    }
  }
}
walk(process.cwd())
const objects = git('rev-list', '--objects', '--all').trim().split('\n')
let blobCount = 0
for (const object of objects) {
  const space = object.indexOf(' ')
  if (space < 0) continue
  const id = object.slice(0, space)
  if (git('cat-file', '-t', id).trim() !== 'blob') continue
  blobCount++
  scan(git('cat-file', '-p', id), `git:${id}:${object.slice(space + 1)}`)
}
const locations = [
  'C:/Users/there/AppData/Local/JobPilot/jobpilot.db',
  'C:/Users/there/.jobpilot/jobpilot.db',
]
for (const file of locations) {
  console.log(JSON.stringify({ database: file, exists: fs.existsSync(file) }))
  if (!fs.existsSync(file)) continue
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    const integrity = db.pragma('integrity_check')
    console.log(JSON.stringify({ databaseIntegrityOk: integrity.length === 1 && integrity[0].integrity_check === 'ok' }))
    for (const row of db.prepare('SELECT key, value FROM settings').all()) {
      const settings = JSON.parse(row.value)
      console.log(JSON.stringify({ settingsRow: row.key, providers: Object.entries(settings.keys ?? {}).map(([provider, value]) => ({ provider, present: typeof value === 'string' && value.length > 0 })), legacyApiKeyPresent: !!settings.apiKey, legacyMistralKeyPresent: !!settings.mistralKey, cvPresent: !!settings.cvText }))
    }
    if (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'credentials'").get()) console.log(JSON.stringify({ protectedProviders: db.prepare('SELECT provider FROM credentials NOT INDEXED').all().map((row) => row.provider) }))
    for (const table of ['applications', 'analyses']) console.log(JSON.stringify({ table, count: db.prepare(`SELECT data FROM ${table} NOT INDEXED`).all().length }))
  } finally { db.close() }
}
console.log(JSON.stringify({ scannedWorkingFiles: fileCount, scannedHistoricalBlobs: blobCount, excludes: ['node_modules', 'dist', 'browser profiles', 'external backups', 'unfetched GitHub history'], result: 'Pattern candidates require review; absence of matches does not prove absence of secrets.' }))
