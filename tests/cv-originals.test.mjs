import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { journeyFixture } from './helpers/journey-fixture.mjs'
import { originalSnapshot, validateOriginals, MAX_CV_BYTES } from '../server/cv-originals.mjs'
import { exportSnapshot, restoreSnapshot, validateSnapshot } from '../server/snapshots.mjs'
import Database from 'better-sqlite3'
import { Document, Packer, Paragraph } from 'docx'
import PDFDocument from 'pdfkit'
import { createEncryptedBackup, restoreEncryptedBackup } from '../server/backups.mjs'
import { createWindowsProtector } from '../server/credentials.mjs'
import { readFileSync } from 'node:fs'
const upload = (name = 'source.txt', text = 'Synthetic User\nuser@example.test\nTypeScript') => ({ id: randomUUID(), name, bytes: Buffer.from(text).toString('base64') })
test('originals require authentication, valid bytes, preserve exact downloads and replay a write once', async t => {
  const { call, db, revision } = await journeyFixture(t), input = upload()
  assert.equal((await call('/api/cv-originals', 'POST', input, { 'X-JobPilot-Session': '' })).status, 401)
  const headers = { 'X-JobPilot-Revision': String(revision()), 'X-JobPilot-Operation': randomUUID() }
  const response = await call('/api/cv-originals', 'POST', input, headers)
  assert.equal(response.status, 200); assert.equal(response.body.result.bytes, undefined)
  assert.deepEqual((await call('/api/cv-originals', 'POST', input, headers)).body, response.body)
  assert.equal(originalSnapshot(db).length, 1)
  assert.deepEqual((await call(`/api/cv-originals/${input.id}/bytes`)).body, Buffer.from(input.bytes, 'base64'))
  assert.equal(response.body.result.sha256, createHash('sha256').update(Buffer.from(input.bytes, 'base64')).digest('hex'))
  assert.equal((await call('/api/cv-originals', 'POST', upload(), { 'X-JobPilot-Revision': '0' })).status, 409)
  for (const bad of [upload('fake.pdf'), upload('fake.docx'), upload('source.txt', ''), { ...upload(), name: '../secret.txt' }, { ...upload(), bytes: '%%%invalid' }, upload('source.txt', 'x'.repeat(MAX_CV_BYTES + 1))]) assert.equal((await call('/api/cv-originals', 'POST', bad)).status, 400)
  assert.equal(originalSnapshot(db).length, 1)
})
test('portable v6 preserves originals; old exports refuse loss, tampering and missing links are rejected', async t => {
  const { call, db, directory } = await journeyFixture(t)
  assert.equal((await call('/api/cv-originals', 'POST', upload())).status, 200)
  const snapshot = exportSnapshot(db, {})
  assert.equal(snapshot.version, 6); assert.throws(() => exportSnapshot(db, {}, 5))
  const destination = join(directory, 'restored.db'); restoreSnapshot(snapshot, destination)
  const restored = new Database(destination)
  assert.deepEqual(originalSnapshot(restored), originalSnapshot(db)); restored.close()
  const bad = structuredClone(snapshot); bad.payload.cvOriginals[0].bytes = Buffer.from('different').toString('base64'); bad.checksum = createHash('sha256').update(JSON.stringify(bad.payload)).digest('hex')
  assert.throws(() => validateSnapshot(bad))
  assert.throws(() => validateOriginals([], { documentVersions: [{ sources: { originalId: 'missing' } }] }))
  for (const version of [1,2,3,4,5]) {
    const { db: empty } = await journeyFixture(t), legacy = exportSnapshot(empty, {}, version), file = join(directory, `legacy-${version}.db`)
    restoreSnapshot(legacy, file); const old = new Database(file); assert.deepEqual(originalSnapshot(old), []); old.close()
  }
})
test('real synthetic DOCX and PDF are parsed locally; malformed and scanned originals are refused', async t => {
  const { call } = await journeyFixture(t)
  const docx = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('Synthetic User'), new Paragraph('TypeScript engineer')] }] }))
  const response = await call('/api/cv-originals', 'POST', { id: randomUUID(), name: 'synthetic.docx', bytes: docx.toString('base64') })
  assert.equal(response.status, 200); assert.match(response.body.result.text, /TypeScript engineer/)
  const makePdf = (text) => new Promise(resolve => { const doc = new PDFDocument(), chunks = []; doc.on('data', chunk => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); if (text) doc.text(text); doc.end() })
  const pdf = await makePdf('Synthetic PDF engineer')
  const parsed = await call('/api/cv-originals', 'POST', { id: randomUUID(), name: 'synthetic.pdf', bytes: pdf.toString('base64') })
  assert.equal(parsed.status, 200); assert.match(parsed.body.result.text, /Synthetic PDF engineer/)
  assert.equal((await call('/api/cv-originals', 'POST', { id: randomUUID(), name: 'scanned.pdf', bytes: (await makePdf('')).toString('base64') })).status, 400)
})
test('encrypted Windows backup preserves original bytes and failed writes roll back', async t => {
  const { db, call, directory, revision } = await journeyFixture(t)
  assert.equal((await call('/api/cv-originals', 'POST', upload())).status, 200)
  const protector = createWindowsProtector(), backup = await createEncryptedBackup(db, protector, directory), path = join(directory, 'encrypted-original.db')
  restoreEncryptedBackup(JSON.parse(readFileSync(backup.path, 'utf8')), protector, path)
  const restored = new Database(path)
  try { assert.deepEqual(originalSnapshot(restored), originalSnapshot(db)) } finally { restored.close() }
  const before = originalSnapshot(db), rev = revision()
  db.exec("CREATE TRIGGER refuse_original BEFORE INSERT ON cv_originals BEGIN SELECT RAISE(ABORT, 'fixture'); END")
  assert.equal((await call('/api/cv-originals', 'POST', upload())).status, 500)
  assert.deepEqual(originalSnapshot(db), before); assert.equal(revision(), rev)
})
