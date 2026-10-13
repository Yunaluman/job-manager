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
import { actionNotifications, dossiersToDecide, parisDay, shiftDay } from '../src/actions-core.mjs'
import { funnelMetrics } from '../src/application-events.mjs'
import { strategyReview } from '../src/strategy-review.mjs'
import { nextJourneyStep } from '../src/journey-progress.mjs'
import { previewRegister, reconcileRegister } from '../server/register-csv.mjs'
import { row, csvFor } from './helpers/register-fixtures.mjs'
import { createWindowsProtector } from '../server/credentials.mjs'
import { journeySnapshot } from '../server/journey.mjs'

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

test('interview alerts escalate independently of preparation and preserve unknown outcomes across calendar boundaries', () => {
  const plan = input({ scheduledDate: '2028-02-29' }), original = structuredClone(plan)
  const alert = (day, reads = [], actions = []) => actionNotifications(actions, [dossier()], reads, day, [plan])
  assert.equal(alert('2028-02-27').length, 0)
  const tomorrow = alert('2028-02-28')[0]
  assert.equal(tomorrow.origin, 'interview'); assert.equal(tomorrow.stage, 'tomorrow')
  const read = { ...(({ id, dueDate, stage }) => ({ id, dueDate, stage }))(tomorrow), readAt: '2028-02-28T12:00:00Z' }
  assert.equal(alert('2028-02-28', [read])[0].unread, false)
  const today = alert('2028-02-29', [read])[0]
  assert.equal(today.id, tomorrow.id); assert.equal(today.stage, 'today'); assert.equal(today.unread, true)
  assert.equal(alert('2028-03-01')[0].stage, 'overdue')
  assert.equal(alert('2028-03-01', [], [preparation({ status: 'done' })])[0].interviewPlanId, plan.id)
  for (const date of ['2026-03-29', '2026-10-25']) {
    assert.equal(actionNotifications([], [], [], shiftDay(date, -1), [{ ...plan, scheduledDate: date }])[0].stage, 'tomorrow')
    assert.equal(actionNotifications([], [], [], shiftDay(date, 1), [{ ...plan, scheduledDate: date }])[0].stage, 'overdue')
  }
  for (const status of ['closed', 'cancelled']) assert.equal(actionNotifications([], [], [], '2028-03-01', [{ ...plan, status }]).length, 0)
  assert.deepEqual(plan, original)
})
test('reading never closes an interview; date/state cycles reset read receipts and reject stale confirmations', async t => {
  const { db, call, revision } = await journeyFixture(t), day = parisDay()
  await call('/api/applications/dossier', 'PUT', dossier())
  const plan = input({ scheduledDate: shiftDay(day, 1) })
  await call('/api/interview-plans/interview', 'PUT', plan)
  const alert = (await call('/api/notifications')).body[0]
  const selected = [{ id: alert.id, dueDate: alert.dueDate, stage: alert.stage }]
  const headers = { 'X-JobPilot-Revision': String(revision()), 'X-JobPilot-Operation': randomUUID() }
  const confirmed = await call('/api/notifications/read', 'POST', selected, headers)
  assert.equal(confirmed.status, 200)
  assert.deepEqual((await call('/api/notifications/read', 'POST', selected, headers)).body, confirmed.body)
  assert.equal(interviewSnapshot(db)[0].status, 'planned')
  assert.equal((await call('/api/notifications')).body[0].unread, false)
  await call('/api/interview-plans/interview', 'PUT', { ...plan, scheduledDate: day })
  assert.equal((await call('/api/notifications/read', 'POST', selected)).status, 400)
  assert.equal((await call('/api/notifications/read', 'POST', selected, { 'X-JobPilot-Revision': headers['X-JobPilot-Revision'] })).status, 409)
  await call('/api/interview-plans/interview', 'PUT', plan)
  assert.equal((await call('/api/notifications')).body[0].unread, true)
  await call('/api/notifications/read', 'POST', selected)
  for (const status of ['closed', 'cancelled']) {
    await call('/api/interview-plans/interview', 'PUT', { ...plan, status })
    assert.equal((await call('/api/notifications')).body.length, 0)
    assert.equal((await call('/api/notifications/read', 'POST', selected)).status, 400)
    await call('/api/interview-plans/interview', 'PUT', plan)
    assert.equal((await call('/api/notifications')).body[0].unread, true)
    await call('/api/notifications/read', 'POST', selected)
  }
})
test('CSV refresh, inactive statuses and orphan links preserve explicit plans without changing factual metrics', async t => {
  const { db, call } = await journeyFixture(t), day = parisDay()
  const csv = csvFor([row({ date_candidature: '2026-01-05', date_reponse: '', statut: 'postule' })])
  const application = reconcileRegister(previewRegister(csv, [], 'synthetic.csv'), [], [{ rowKey: '1', targetId: null }])[0]
  db.prepare('INSERT INTO applications VALUES (?, ?)').run(application.id, JSON.stringify(application))
  const document = await call('/api/documents/fixture-letter/versions', 'POST', { applicationId: application.id, kind: 'letter', title: 'Synthetic immutable letter', status: 'ready', content: { sender: 'Fixture', recipient: 'Fixture', placeDate: 'Paris', subject: 'Application', greeting: '', body: 'Synthetic verified content', closing: '', signature: '' }, layout: { fontSize: 11, marginMm: 20, hidden: [] }, sources: {} })
  assert.equal(document.status, 200)
  assert.equal((await call('/api/submissions', 'POST', { id: 'fixture-send', applicationId: application.id, occurredAt: '2026-01-05', letterVersionId: document.body.result.version.id, note: 'Synthetic declaration' })).status, 200)
  const originalJourney = journeySnapshot(db)
  const before = db.prepare('SELECT data FROM applications').get().data, metrics = funnelMetrics([JSON.parse(before)]), bilan = strategyReview([JSON.parse(before)], [], '2026-01-01', '2026-01-31', day)
  assert.equal((await call('/api/interview-plans/interview', 'PUT', input({ applicationId: application.id, scheduledDate: day }))).status, 200)
  assert.equal((await call('/api/actions/preparation', 'PUT', preparation({ applicationId: application.id, interviewPlan: { id: 'interview', scheduledDate: day } }))).status, 200)
  assert.equal((await call('/api/actions/preparation', 'PUT', preparation({ applicationId: application.id, interviewPlan: { id: 'interview', scheduledDate: day }, status: 'done' }))).status, 200)
  const actual = db.prepare('SELECT data FROM applications').get().data
  assert.equal(actual, before)
  assert.deepEqual(funnelMetrics([JSON.parse(actual)]), metrics)
  assert.deepEqual(strategyReview([JSON.parse(actual)], [], '2026-01-01', '2026-01-31', day), bilan)
  assert.deepEqual(journeySnapshot(db), originalJourney)
  const plans = interviewSnapshot(db)
  assert.deepEqual(dossiersToDecide([application], [], plans), [])
  const inactiveCsv = csvFor([row({ date_candidature: '2026-01-05', statut: 'refus', date_reponse: '' })])
  const updated = reconcileRegister(previewRegister(inactiveCsv, [application], 'synthetic.csv'), [application], [{ rowKey: '1', targetId: application.id }])[0]
  db.prepare('UPDATE applications SET data = ? WHERE id = ?').run(JSON.stringify(updated), application.id)
  assert.deepEqual(interviewSnapshot(db), plans)
  assert.equal((await call('/api/notifications')).body.filter(item => item.origin === 'interview').length, 1)
  // Simulate an orphan restored from an independently edited snapshot; imported dossiers cannot be deleted by the API.
  db.prepare('DELETE FROM applications WHERE id = ?').run(application.id)
  assert.equal((await call('/api/notifications')).body[0].interviewPlanId, 'interview')
  assert.equal((await call('/api/interview-plans/interview', 'PUT', input({ applicationId: application.id, scheduledDate: day, status: 'closed' }))).status, 200)
})
test('an explicit plan supplies the next follow-up without inventing a send or response', () => {
  const app = dossier(), journey = { submissions: [], documents: [], documentVersions: [] }, plan = input()
  assert.equal(nextJourneyStep(app, journey, [], [plan]).interviewPlanId, plan.id)
  assert.deepEqual(dossiersToDecide([app], [], [plan]), [])
  assert.equal(dossiersToDecide([app], [], [{ ...plan, status: 'closed' }]).length, 1)
  assert.equal(funnelMetrics([app]).responses, 0)
})
test('real Windows DPAPI backup preserves interview plans and their read confirmations', async t => {
  const { db, call, directory } = await journeyFixture(t), day = parisDay()
  await call('/api/applications/dossier', 'PUT', dossier())
  await call('/api/interview-plans/interview', 'PUT', input({ scheduledDate: day }))
  const alert = (await call('/api/notifications')).body[0]
  await call('/api/notifications/read', 'POST', [{ id: alert.id, dueDate: alert.dueDate, stage: alert.stage }])
  const protector = createWindowsProtector(), backup = await createEncryptedBackup(db, protector, directory)
  const { readFileSync } = await import('node:fs'), path = join(directory, 'dpapi-interviews.db')
  restoreEncryptedBackup(JSON.parse(readFileSync(backup.path, 'utf8')), protector, path)
  const restored = new Database(path)
  try { assert.deepEqual(exportSnapshot(restored, {}).payload, exportSnapshot(db, {}).payload) } finally { restored.close() }
})

test('distinct same-day interviews retain separate sources, reminders and histories', async t => {
  const { call, db } = await journeyFixture(t), day = parisDay()
  await call('/api/applications/dossier', 'PUT', dossier())
  assert.equal((await call('/api/interview-plans/interview', 'PUT', input({ scheduledDate: day }))).status, 200)
  assert.equal((await call('/api/interview-plans/second', 'PUT', input({ id: 'second', scheduledDate: day, sourceDescription: 'Second explicit invitation' }))).status, 200)
  const alerts = (await call('/api/notifications')).body
  assert.equal(alerts.length, 2); assert.equal(new Set(alerts.map(item => item.id)).size, 2)
  assert.equal(interviewSnapshot(db).length, 2)
})
