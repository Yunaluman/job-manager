import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { randomUUID, createHash } from 'node:crypto'
import { join } from 'node:path'
import { journeyFixture } from './helpers/journey-fixture.mjs'
import { initializeDatabase } from '../server/app.mjs'
import { interviewSnapshot } from '../server/interviews.mjs'
import { validateInterviewInput, validateInterviewPlans } from '../src/interviews-core.mjs'
import { exportSnapshot, restoreSnapshot, validateSnapshot } from '../server/snapshots.mjs'
import { createEncryptedBackup, restoreEncryptedBackup } from '../server/backups.mjs'

const dossier = (id = 'dossier') => ({ id, company: 'Fixture', title: 'Engineer', status: 'postulee', history: [], createdAt: '2026-01-01' })
const input = (patch = {}) => ({ id: 'interview', applicationId: 'dossier', title: 'Technical interview', scheduledDate: '2028-02-29', sourceDescription: 'Synthetic invitation', sourceReference: '', note: '', status: 'planned', ...patch })
const preparation = (patch = {}) => ({ id: 'preparation', applicationId: 'dossier', title: 'Prepare technical interview', kind: 'prepare-interview', dueDate: '2028-02-28', priority: 'normal', note: '', resultNote: '', status: 'todo', interviewPlan: { id: 'interview', scheduledDate: '2028-02-29' }, ...patch })

test('interview plans require explicit provenance, calendar days and bounded input', () => {
  validateInterviewInput(input())
  for (const patch of [{ scheduledDate: '2026-02-29' }, { sourceDescription: ' ' }, { status: 'held' }, { applicationId: '' }, { createdAt: 'forged' }, { sourceReference: null }, { title: 'x'.repeat(301) }]) assert.throws(() => validateInterviewInput(input(patch)))
})
test('interview writes preserve history, reject fabricated links, replay once and roll back atomically', async t => {
  const { db, call, revision } = await journeyFixture(t)
  assert.equal((await call('/api/interview-plans')).status, 200)
  assert.equal((await call('/api/interview-plans/interview', 'PUT', input(), { 'X-JobPilot-Session': '' })).status, 401)
  assert.equal((await call('/api/interview-plans/interview', 'PUT', input())).status, 400)
  await call('/api/applications/dossier', 'PUT', dossier())
  const before = db.prepare('SELECT data FROM applications').get().data
  const headers = { 'X-JobPilot-Revision': String(revision()), 'X-JobPilot-Operation': randomUUID() }
  const first = await call('/api/interview-plans/interview', 'PUT', input(), headers)
  assert.equal(first.status, 200)
  assert.deepEqual((await call('/api/interview-plans/interview', 'PUT', input(), headers)).body, first.body)
  assert.equal(interviewSnapshot(db)[0].history.length, 1)
  assert.equal((await call('/api/interview-plans/interview', 'PUT', input({ note: 'conflict' }), { 'X-JobPilot-Revision': headers['X-JobPilot-Revision'] })).status, 409)
  for (const patch of [{ scheduledDate: '2028-03-01' }, { status: 'closed' }, { status: 'planned' }, { status: 'cancelled' }]) {
    const current = interviewSnapshot(db)[0]; const { history, createdAt, updatedAt, ...values } = current
    assert.equal((await call('/api/interview-plans/interview', 'PUT', { ...values, ...patch })).status, 200)
  }
  assert.deepEqual(interviewSnapshot(db)[0].history.map(item => item.event), ['created', 'rescheduled', 'closed', 'reopened', 'cancelled'])
  assert.equal(interviewSnapshot(db)[0].history[0].values.scheduledDate, '2028-02-29')
  assert.equal(db.prepare('SELECT data FROM applications').get().data, before)
  await call('/api/applications/other', 'PUT', dossier('other'))
  assert.equal((await call('/api/interview-plans/interview', 'PUT', input({ applicationId: 'other' }))).status, 400)
  const rev = revision(), saved = interviewSnapshot(db)
  db.exec("CREATE TRIGGER reject_interview BEFORE UPDATE ON interview_plans BEGIN SELECT RAISE(ABORT, 'fixture rollback'); END;")
  assert.equal((await call('/api/interview-plans/interview', 'PUT', input())).status, 500)
  assert.equal(revision(), rev); assert.deepEqual(interviewSnapshot(db), saved)
})
test('preparations remain separate, unique while open, and never move when an interview is rescheduled', async t => {
  const { db, call } = await journeyFixture(t)
  await call('/api/applications/dossier', 'PUT', dossier())
  await call('/api/interview-plans/interview', 'PUT', input())
  assert.equal((await call('/api/actions/preparation', 'PUT', preparation())).status, 200)
  const saved = db.prepare('SELECT data FROM actions').get().data
  assert.equal((await call('/api/actions/duplicate', 'PUT', preparation({ id: 'duplicate' }))).status, 400)
  assert.equal((await call('/api/actions/bad', 'PUT', preparation({ id: 'bad', kind: 'other' }))).status, 400)
  assert.equal((await call('/api/actions/bad', 'PUT', preparation({ id: 'bad', source: { applicationId: 'dossier', dueDate: '2028-02-29' } }))).status, 400)
  await call('/api/interview-plans/interview', 'PUT', input({ scheduledDate: '2028-03-02' }))
  assert.equal(db.prepare('SELECT data FROM actions').get().data, saved)
  assert.equal((await call('/api/actions/preparation', 'PUT', preparation({ status: 'done' }))).status, 200)
  assert.equal(interviewSnapshot(db)[0].status, 'planned')
  assert.equal((await call('/api/actions/new', 'PUT', preparation({ id: 'new' }))).status, 400)
  assert.equal((await call('/api/actions/new', 'PUT', preparation({ id: 'new', interviewPlan: { id: 'interview', scheduledDate: '2028-03-02' } }))).status, 200)
  assert.equal((await call('/api/actions/preparation', 'PUT', preparation())).status, 400)
  await call('/api/applications/dossier', 'DELETE')
  assert.equal((await call('/api/interview-plans/interview', 'PUT', input({ status: 'closed' }))).status, 200)
  assert.equal((await call('/api/interview-plans/new', 'PUT', input({ id: 'new' }))).status, 400)
})
test('portable v5 and encrypted backups preserve plans; v1-v4 restore empty planning and reject data loss', async t => {
  const { db, call, directory, protector } = await journeyFixture(t)
  for (const version of [1, 2, 3, 4]) {
    const snapshot = exportSnapshot(db, {}, version), path = join(directory, `legacy-${version}.db`)
    restoreSnapshot(snapshot, path)
    const restored = new Database(path)
    try { assert.deepEqual(interviewSnapshot(restored), []) } finally { restored.close() }
  }
  await call('/api/applications/dossier', 'PUT', dossier())
  await call('/api/interview-plans/interview', 'PUT', input())
  await call('/api/actions/preparation', 'PUT', preparation())
  for (const version of [1, 2, 3, 4]) assert.throws(() => exportSnapshot(db, {}, version), /v5/)
  const snapshot = exportSnapshot(db, {}); assert.equal(snapshot.version, 5)
  const path = join(directory, 'v5.db'); restoreSnapshot(snapshot, path)
  const restored = new Database(path)
  try { assert.deepEqual(exportSnapshot(restored, {}).payload, snapshot.payload) } finally { restored.close() }
  const backup = await createEncryptedBackup(db, protector, directory)
  const { readFileSync } = await import('node:fs')
  const encryptedPath = join(directory, 'encrypted.db')
  restoreEncryptedBackup(JSON.parse(readFileSync(backup.path, 'utf8')), protector, encryptedPath)
  const encrypted = new Database(encryptedPath)
  try { assert.deepEqual(interviewSnapshot(encrypted), interviewSnapshot(db)) } finally { encrypted.close() }
  const bad = structuredClone(snapshot); bad.payload.interviewPlans[0].history[0].values.applicationId = 'invented'
  bad.checksum = createHash('sha256').update(JSON.stringify(bad.payload)).digest('hex')
  assert.throws(() => validateSnapshot(bad))
  const missing = structuredClone(snapshot); missing.payload.interviewPlans = []
  missing.checksum = createHash('sha256').update(JSON.stringify(missing.payload)).digest('hex')
  assert.throws(() => validateSnapshot(missing))
  const forged = structuredClone(snapshot); forged.payload.actions[0].interviewPlan.scheduledDate = '2028-12-01'
  forged.checksum = createHash('sha256').update(JSON.stringify(forged.payload)).digest('hex')
  assert.throws(() => validateSnapshot(forged))
  const old = structuredClone(snapshot); old.version = 4; delete old.payload.interviewPlans
  old.checksum = createHash('sha256').update(JSON.stringify(old.payload)).digest('hex')
  assert.throws(() => validateSnapshot(old), /v5/)
})
test('additive initialization never manufactures a plan from an existing future milestone', () => {
  const db = new Database(':memory:')
  try {
    initializeDatabase(db)
    const application = { ...dossier(), events: [{ id: 'future', kind: 'interview', occurredAt: '2028-02-29', source: 'manual' }] }
    db.prepare('INSERT INTO applications VALUES (?, ?)').run(application.id, JSON.stringify(application))
    initializeDatabase(db)
    assert.deepEqual(interviewSnapshot(db), [])
    assert.deepEqual(JSON.parse(db.prepare('SELECT data FROM applications').get().data), application)
    assert.throws(() => validateInterviewPlans(undefined))
  } finally { db.close() }
})
