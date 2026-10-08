import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { createServer, request } from 'node:http'
import { randomUUID, randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp, initializeDatabase } from '../server/app.mjs'
import { createWriteCoordinator } from '../server/writes.mjs'
import { planningSnapshot } from '../server/actions.mjs'
import { exportSnapshot, restoreSnapshot, validateSnapshot } from '../server/snapshots.mjs'
import { createEncryptedBackup, restoreEncryptedBackup } from '../server/backups.mjs'
import { parisDay, shiftDay, weekEnd, actionBucket, sortActions, actionNotifications, sourceDeadlines, dossiersToDecide, validateActionInput } from '../src/actions-core.mjs'
import { csvFor, row } from './helpers/register-fixtures.mjs'

const input = (patch = {}) => ({ id: 'task', title: 'Prepare fixture', kind: 'other', priority: 'normal', status: 'todo', note: '', resultNote: '', ...patch })
const action = (patch = {}) => ({ ...input(), createdAt: '2026-01-01T12:00:00Z', updatedAt: '2026-01-01T12:00:00Z', history: [{ at: '2026-01-01T12:00:00Z', event: 'created', note: '', status: 'todo' }], ...patch })
const dossier = (patch = {}) => ({ id: 'dossier', company: 'Fixture', title: 'Engineer', status: 'postulee', createdAt: '2026-01-01', history: [], ...patch })
const read = (item) => ({ id: item.id, dueDate: item.dueDate, stage: item.stage, readAt: '2026-01-01T12:00:00Z' })

test('Paris calendar respects midnight, DST transitions and Monday-Sunday weeks', () => {
  assert.equal(parisDay(new Date('2026-03-28T23:30:00Z')), '2026-03-29')
  assert.equal(parisDay(new Date('2026-03-29T22:30:00Z')), '2026-03-30')
  assert.equal(parisDay(new Date('2026-10-25T22:30:00Z')), '2026-10-25')
  assert.equal(parisDay(new Date('2026-10-25T23:30:00Z')), '2026-10-26')
  assert.equal(weekEnd('2026-10-11'), '2026-10-11')
  assert.equal(weekEnd('2026-10-12'), '2026-10-18')
  assert.equal(shiftDay('2028-02-28', 1), '2028-02-29')
  assert.equal(actionBucket(action({ dueDate: '2026-10-11' }), '2026-10-12'), 'overdue')
  assert.equal(actionBucket(action({ dueDate: '2026-10-12' }), '2026-10-12'), 'today')
  assert.equal(actionBucket(action({ dueDate: '2026-10-18' }), '2026-10-12'), 'week')
  assert.equal(actionBucket(action({ dueDate: '2026-10-19' }), '2026-10-12'), 'later')
  assert.equal(actionBucket(action(), '2026-10-12'), 'unplanned')
})
test('open actions sort by date, priority, creation and stable id', () => {
  const sorted = sortActions([action({ id: 'low', dueDate: '2026-10-08', priority: 'low' }), action({ id: 'unplanned', priority: 'high' }), action({ id: 'early', dueDate: '2026-10-07' }), action({ id: 'new', dueDate: '2026-10-08', priority: 'high', createdAt: '2026-02-01T12:00:00Z' }), action({ id: 'old', dueDate: '2026-10-08', priority: 'high' })])
  assert.deepEqual(sorted.map((item) => item.id), ['early', 'old', 'new', 'low', 'unplanned'])
})
test('J-1/J/J+1 share one identity, reset unread on escalation and resolve or recalculate', () => {
  const task = action({ dueDate: '2026-10-08' })
  assert.equal(actionNotifications([task], [], [], '2026-10-06').length, 0)
  const tomorrow = actionNotifications([task], [], [], '2026-10-07')[0]
  assert.equal(tomorrow.stage, 'tomorrow')
  assert.equal(actionNotifications([task], [], [read(tomorrow)], '2026-10-07')[0].unread, false)
  const today = actionNotifications([task], [], [read(tomorrow)], '2026-10-08')[0]
  assert.equal(today.id, tomorrow.id); assert.equal(today.stage, 'today'); assert.equal(today.unread, true)
  const overdue = actionNotifications([task], [], [read(today)], '2026-10-09')[0]
  assert.equal(overdue.id, today.id); assert.equal(overdue.stage, 'overdue'); assert.equal(overdue.unread, true)
  assert.equal(actionNotifications([task], [], [read(overdue)], '2026-10-10')[0].unread, false)
  for (const status of ['done', 'cancelled']) assert.equal(actionNotifications([{ ...task, status }], [], [], '2026-10-09').length, 0)
  assert.equal(actionNotifications([{ ...task, dueDate: '2026-10-15' }], [], [], '2026-10-09').length, 0)
})
test('explicit source ownership suppresses duplicates, keeps changed dates separate and filters undecided dossiers', () => {
  const app = dossier({ nextActionAt: '2026-10-08' })
  const task = action({ applicationId: app.id, dueDate: '2026-10-09', source: { applicationId: app.id, dueDate: app.nextActionAt } })
  assert.equal(actionNotifications([], [app], [], '2026-10-08')[0].origin, 'source')
  assert.equal(actionNotifications([task], [app], [], '2026-10-08').length, 1)
  assert.equal(sourceDeadlines([{ ...app, nextActionAt: '2026-10-10' }], [task])[0].managedActionId, task.id)
  assert.equal(task.dueDate, '2026-10-09')
  assert.equal(actionNotifications([{ ...task, status: 'done' }], [app], [], '2026-10-08').length, 0)
  assert.equal(sourceDeadlines([{ ...app, nextActionAt: '2026-10-10' }], [{ ...task, status: 'done' }])[0].managedActionId, undefined)
  const apps = [dossier(), dossier({ id: 'offer', status: 'offre' }), dossier({ id: 'refusal', status: 'refusee' }), dossier({ id: 'abandoned', register: { disposition: 'archived' } }), dossier({ id: 'excluded', register: { disposition: 'excluded' } }), dossier({ id: 'planned' }), dossier({ id: 'source', nextActionAt: '2026-10-08' })]
  assert.deepEqual(dossiersToDecide(apps, [action({ applicationId: 'planned' })]).map((item) => item.id), ['dossier', 'offer'])
})
test('server schema rejects invalid dates, enum values and fabricated metadata', () => {
  for (const patch of [{ dueDate: '2026-02-30' }, { priority: 'urgent' }, { status: 'sent' }, { title: '  ' }, { kind: 'email' }, { history: [] }, { source: { applicationId: 'missing', dueDate: '2026-10-08' } }]) assert.throws(() => validateActionInput(input(patch)))
})

function protector() {
  const key = randomBytes(32)
  return { protect(text) { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv); return Buffer.concat([iv, cipher.update(text, 'utf8'), cipher.final(), cipher.getAuthTag()]).toString('base64') },
    unprotect(value) { const bytes = Buffer.from(value, 'base64'), cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12)); cipher.setAuthTag(bytes.subarray(-16)); return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]).toString('utf8') } }
}
function directory(t) { const path = mkdtempSync(join(tmpdir(), 'jobpilot-actions-')); t.after(() => rmSync(path, { recursive: true, force: true })); return path }
async function fixture(t) {
  const db = new Database(':memory:'), server = createServer()
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const result = createApp({ db, protector: protector(), port: server.address().port, backupDirectory: directory(t), fetchProvider: () => { throw new Error('Paid calls forbidden in planning tests') } })
  server.on('request', result.app)
  t.after(async () => { server.closeAllConnections(); await new Promise((done) => server.close(done)); db.close() })
  const revision = () => db.prepare('SELECT revision FROM persistence_revision').get().revision
  const call = (path, method = 'GET', body, headers = {}) => new Promise((done, reject) => {
    const req = request({ host: '127.0.0.1', port: server.address().port, path, method, headers: { 'X-JobPilot-Session': result.token, 'X-JobPilot-Revision': String(revision()), 'X-JobPilot-Operation': randomUUID(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers } }, (res) => { let text = ''; res.on('data', (bytes) => text += bytes); res.on('end', () => done({ status: res.statusCode, body: JSON.parse(text) })) })
    req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body))
  })
  return { db, call, revision }
}
test('action writes require session and valid links; orphan history survives and can detach', async (t) => {
  const { db, call } = await fixture(t)
  assert.equal((await call('/api/actions/task', 'PUT', input(), { 'X-JobPilot-Session': '' })).status, 401)
  assert.equal((await call('/api/actions/task', 'PUT', input({ applicationId: 'absent' }))).status, 400)
  assert.equal((await call('/api/actions/task', 'PUT', input({ status: 'bad' }))).status, 400)
  await call('/api/applications/dossier', 'PUT', dossier())
  assert.equal((await call('/api/actions/task', 'PUT', input({ applicationId: 'dossier' }))).status, 200)
  await call('/api/applications/dossier', 'DELETE')
  assert.equal((await call('/api/actions/task', 'PUT', input({ applicationId: 'dossier', note: 'Historical orphan' }))).status, 200)
  assert.equal((await call('/api/actions/task', 'PUT', input())).status, 200)
  assert.equal(planningSnapshot(db).actions[0].applicationId, undefined)
})
test('concurrent tabs, receipt replay and failed writes cannot lose or falsely confirm actions', async (t) => {
  const { db, call, revision } = await fixture(t)
  const headers = { 'X-JobPilot-Revision': '0', 'X-JobPilot-Operation': randomUUID() }
  const first = await call('/api/actions/task', 'PUT', input(), headers)
  assert.equal(first.status, 200)
  assert.deepEqual((await call('/api/actions/task', 'PUT', input(), headers)).body, first.body)
  assert.equal(revision(), 1)
  assert.equal((await call('/api/actions/other', 'PUT', input({ id: 'other' }), { 'X-JobPilot-Revision': '0' })).status, 409)
  db.exec("CREATE TRIGGER refuse_action BEFORE UPDATE ON actions BEGIN SELECT RAISE(ABORT, 'fixture failure'); END")
  assert.equal((await call('/api/actions/task', 'PUT', input({ title: 'Lost update' }))).status, 500)
  assert.equal(revision(), 1); assert.equal(planningSnapshot(db).actions[0].title, input().title)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM persistence_receipts').get().n, 1)
})
test('source actions leave imported CSV copies unchanged; completion, reschedule and reopening are documented', async (t) => {
  const { db, call } = await fixture(t)
  const day = parisDay(), csv = csvFor([row({ statut: 'postulee', date_relance: day })])
  const imported = await call('/api/register/import', 'POST', { csv, sourceName: 'synthetic.csv', resolutions: [{ rowKey: '1', targetId: null }] })
  assert.equal(imported.status, 200, JSON.stringify(imported.body))
  const original = db.prepare('SELECT data FROM applications').get().data, app = JSON.parse(original)
  const source = { applicationId: app.id, dueDate: day }, task = input({ applicationId: app.id, dueDate: day, source })
  assert.equal((await call('/api/actions/task', 'PUT', task)).status, 200)
  assert.equal((await call('/api/actions/duplicate', 'PUT', { ...task, id: 'duplicate' })).status, 400)
  const notification = (await call('/api/notifications')).body[0]
  const selected = [((({ id, dueDate, stage }) => ({ id, dueDate, stage }))(notification))]
  const headers = { 'X-JobPilot-Revision': String((await call('/api/state')).body.revision), 'X-JobPilot-Operation': randomUUID() }
  const ack = await call('/api/notifications/read', 'POST', selected, headers)
  assert.equal(ack.status, 200); assert.deepEqual((await call('/api/notifications/read', 'POST', selected, headers)).body, ack.body)
  assert.equal((await call('/api/notifications')).body[0].unread, false)
  assert.equal((await call('/api/notifications/read', 'POST', [{ ...selected[0], stage: 'tomorrow' }])).status, 400)
  await call('/api/actions/task', 'PUT', { ...task, status: 'done', resultNote: 'Completed preparation only' })
  assert.equal((await call('/api/notifications')).body.length, 0)
  await call('/api/actions/task', 'PUT', task)
  assert.equal((await call('/api/notifications')).body[0].unread, true)
  await call('/api/actions/task', 'PUT', { ...task, dueDate: shiftDay(day, 7) })
  assert.equal((await call('/api/notifications')).body.length, 0)
  await call('/api/actions/task', 'PUT', { ...task, dueDate: shiftDay(day, 7), status: 'cancelled' })
  assert.deepEqual(planningSnapshot(db).actions[0].history.map((entry) => entry.event), ['created', 'done', 'reopened', 'rescheduled', 'cancelled'])
  assert.equal(db.prepare('SELECT data FROM applications').get().data, original)
})
test('v3 portable and encrypted backups preserve planning; v1/v2 stay empty and cannot omit new data', async (t) => {
  const { db, call } = await fixture(t), destination = directory(t)
  for (const version of [1, 2]) {
    const legacy = exportSnapshot(db, {}, version), path = join(destination, `legacy-${version}.db`)
    restoreSnapshot(legacy, path)
    const old = new Database(path)
    try { initializeDatabase(old); assert.deepEqual(planningSnapshot(old), { actions: [], notificationReads: [] }) } finally { old.close() }
  }
  await call('/api/actions/task', 'PUT', input({ dueDate: parisDay() }))
  const notification = (await call('/api/notifications')).body[0]
  await call('/api/notifications/read', 'POST', [{ id: notification.id, dueDate: notification.dueDate, stage: notification.stage }])
  const snapshot = exportSnapshot(db, {})
  assert.equal(snapshot.version, 4)
  for (const version of [1, 2]) assert.throws(() => exportSnapshot(db, {}, version), /v3/)
  const portablePath = join(destination, 'portable.db'); restoreSnapshot(snapshot, portablePath)
  const portable = new Database(portablePath)
  try { assert.deepEqual(planningSnapshot(portable), planningSnapshot(db)) } finally { portable.close() }
  const protect = protector(), backup = await createEncryptedBackup(db, protect, destination)
  const restoredPath = join(destination, 'encrypted.db'); restoreEncryptedBackup(JSON.parse(readFileSync(backup.path, 'utf8')), protect, restoredPath)
  const encrypted = new Database(restoredPath)
  try { assert.deepEqual(planningSnapshot(encrypted), planningSnapshot(db)) } finally { encrypted.close() }
  const bad = structuredClone(snapshot); bad.payload.actions[0].priority = 'invented'; bad.checksum = createHash('sha256').update(JSON.stringify(bad.payload)).digest('hex')
  assert.throws(() => validateSnapshot(bad))
})
test('changed source dates never move local tasks and closed source history remains editable', async (t) => {
  const { db, call } = await fixture(t), day = parisDay()
  const app = dossier({ nextActionAt: day }); await call('/api/applications/dossier', 'PUT', app)
  const task = input({ applicationId: app.id, dueDate: day, source: { applicationId: app.id, dueDate: day } })
  await call('/api/actions/task', 'PUT', task)
  const moved = { ...app, nextActionAt: shiftDay(day, 1) }; await call('/api/applications/dossier', 'PUT', moved)
  assert.equal(planningSnapshot(db).actions[0].dueDate, day)
  assert.equal((await call('/api/notifications')).body.length, 1)
  assert.equal((await call('/api/actions/stale', 'PUT', { ...task, id: 'stale' })).status, 400)
  await call('/api/actions/task', 'PUT', { ...task, status: 'done' })
  const replacement = input({ id: 'replacement', applicationId: app.id, dueDate: moved.nextActionAt, source: { applicationId: app.id, dueDate: moved.nextActionAt } })
  assert.equal((await call('/api/actions/replacement', 'PUT', replacement)).status, 200)
  assert.equal((await call('/api/actions/task', 'PUT', { ...task, status: 'done', resultNote: 'Clarified historical outcome' })).status, 200)
  assert.equal((await call('/api/actions/task', 'PUT', task)).status, 400)
  assert.equal((await call('/api/notifications')).body.length, 1)
})
test('initialization adds planning tables without rewriting a legacy application', () => {
  const db = new Database(':memory:')
  try {
    db.exec('CREATE TABLE applications (id TEXT PRIMARY KEY, data TEXT NOT NULL)')
    const original = JSON.stringify(dossier()); db.prepare('INSERT INTO applications VALUES (?, ?)').run('dossier', original)
    initializeDatabase(db); createWriteCoordinator(db); initializeDatabase(db)
    assert.equal(db.prepare('SELECT data FROM applications').get().data, original)
    assert.deepEqual(planningSnapshot(db), { actions: [], notificationReads: [] })
  } finally { db.close() }
})
