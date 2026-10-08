import test from 'node:test'
import assert from 'node:assert/strict'
import { parseRegisterCsv, previewRegister, reconcileRegister, validateRegisterProjection } from '../server/register-csv.mjs'

import { columns, row, csvFor } from './helpers/register-fixtures.mjs'
import { funnelMetrics } from '../src/application-events.mjs'

test('UTF8 BOM, CRLF, quoted multiline cells and extra evidence fields survive exactly', () => {
  const original = row({ verification_source: 'human checked', date_verification: '2026-01-03' })
  const csv = csvFor([original], [...columns, 'verification_source', 'date_verification'])
  const raw = parseRegisterCsv(csv)[0]
  for (const [key, value] of Object.entries(original)) assert.equal(raw[key], value)
  const preview = previewRegister(csv, [])
  const [app] = reconcileRegister(preview, [], [{ rowKey: '1', targetId: null }])
  validateRegisterProjection(app)
  assert.deepEqual(app.register.raw, raw)
  assert.deepEqual(app.events.map((event) => [event.kind, event.occurredAt]), [['sent', '2026-01-01'], ['response', '2026-01-04']])
  assert.equal(app.events.some((event) => event.kind === 'refusal'), false)
  assert.equal(app.eventHistoryComplete, false)
})

test('malformed syntax, duplicate/missing headers, excessive columns and invalid UTF8 fail closed', () => {
  for (const csv of ['id;id\n1;2', 'company;title\na;b', csvFor([row()]) + ';bad', csvFor([row()]).replace('"Fixture Équipe"', '"Fixture"garbage'), csvFor([row()]).slice(0, -1), csvFor([row({ notes: '\ufffd' })])]) assert.throws(() => parseRegisterCsv(csv), { status: 400 })
})

test('invalid identifiers, dates and unknown statuses appear in preview and cannot be selected', () => {
  for (const patch of [{ id: 'bad' }, { date_candidature: '2026-02-30' }, { statut: 'constructor' }, { statut: 'invented' }, { url: 'javascript:alert(1)' }]) {
    const preview = previewRegister(csvFor([row(patch)]), [])
    assert.ok(preview.rows[0].errors.length)
    assert.throws(() => reconcileRegister(preview, [], [{ rowKey: '1', targetId: null }]), { status: 400 })
  }
})

test('excluded, archived and unanswered statuses retain their original vocabulary', () => {
  for (const [statut, disposition, status] of [['ecarte', 'excluded', 'a_postuler'], ['abandonne', 'archived', 'a_postuler'], ['sans_reponse', 'active', 'postulee']]) {
    const preview = previewRegister(csvFor([row({ statut, date_candidature: '', date_reponse: '' })]), [])
    const [app] = reconcileRegister(preview, [], [{ rowKey: '1', targetId: null }])
    assert.equal(app.register.disposition, disposition)
    assert.equal(app.status, status)
    assert.equal(app.register.raw.statut, statut)
    assert.deepEqual(app.events, [])
  }
})

test('external ids provide stable repeated reconciliation and missing rows are reported without deletion', () => {
  const csv = csvFor([row()])
  const [app] = reconcileRegister(previewRegister(csv, []), [], [{ rowKey: '1', targetId: null }])
  const unchanged = previewRegister(csv, [app])
  assert.equal(unchanged.rows[0].unchanged, true)
  assert.equal(unchanged.rows[0].defaultTarget, app.id)
  assert.throws(() => reconcileRegister(unchanged, [app], [{ rowKey: '1', targetId: null }]))
  const changed = previewRegister(csvFor([row({ statut: 'sans_reponse' })]), [app])
  assert.throws(() => reconcileRegister(changed, [app], [{ rowKey: '1', targetId: null }]))
  const [updated] = reconcileRegister(changed, [app], [{ rowKey: '1', targetId: app.id }])
  assert.equal(updated.id, app.id)
  assert.equal(updated.createdAt, app.createdAt)
  assert.equal(updated.history.length, 2)
  assert.equal(previewRegister(csvFor([]), [app]).missing[0].id, app.id)
})

test('identity and URL similarities are candidates, never automatic irreversible matches', () => {
  const local = { id: 'local', company: 'FIXTURE EQUIPE', title: 'développeur', location: 'Paris', status: 'entretien', history: [], createdAt: '2025-01-01' }
  const preview = previewRegister(csvFor([row()]), [local])
  assert.equal(preview.rows[0].candidates[0].reason, 'identity')
  assert.equal(preview.rows[0].defaultTarget, null)
  assert.throws(() => reconcileRegister(preview, [local], [{ rowKey: '1', targetId: null }]))
  const [adopted] = reconcileRegister(preview, [local], [{ rowKey: '1', targetId: local.id }])
  assert.equal(adopted.id, local.id)
  assert.equal(adopted.status, 'refusee')
  assert.equal(preview.rows[0].candidates[0].changes.status.before, 'entretien')
  assert.equal(preview.rows[0].candidates[0].changes.status.after, 'refusee')
  assert.equal(reconcileRegister(preview, [local], [{ rowKey: '1', targetId: null, allowDuplicate: true }]).length, 1)
})

test('duplicate identifiers, duplicate identities, reused targets and conflicting external ids cannot silently merge', () => {
  const duplicate = previewRegister(csvFor([row(), row()]), [])
  assert.ok(duplicate.rows.every((record) => record.errors.length))
  const identities = previewRegister(csvFor([row(), row({ id: '2026-002' })]), [])
  assert.throws(() => reconcileRegister(identities, [], [{ rowKey: '1', targetId: null }]))
  const local = { id: 'local', company: 'Fixture Équipe', title: 'Développeur', location: 'Paris', history: [] }
  const preview = previewRegister(csvFor([row(), row({ id: '2026-002' })]), [local])
  assert.throws(() => reconcileRegister(preview, [local], [{ rowKey: '1', targetId: 'local' }, { rowKey: '2', targetId: 'local' }]))
  const [imported] = reconcileRegister(previewRegister(csvFor([row()]), []), [], [{ rowKey: '1', targetId: null }])
  assert.throws(() => reconcileRegister(previewRegister(csvFor([row({ id: '2026-002' })]), [imported]), [imported], [{ rowKey: '1', targetId: imported.id }]))
})

test('restored projection hashes and business fields must match their original source cells', () => {
  const preview = previewRegister(csvFor([row()]), [])
  const [app] = reconcileRegister(preview, [], [{ rowKey: '1', targetId: null }])
  validateRegisterProjection(app)
  for (const mutated of [{ ...app, company: 'tampered' }, { ...app, eventHistoryComplete: true }, { ...app, events: [] }, { ...app, register: { ...app.register, raw: { ...app.register.raw, notes: 'tampered' } } }]) assert.throws(() => validateRegisterProjection(mutated), { status: 400 })
})

test('adopting a refusal preserves dated local interviews through subsequent CSV refreshes', () => {
  const interview = { id: 'known-interview', kind: 'interview', occurredAt: '2026-01-03', source: 'manual' }
  const sent = { id: 'known-send', kind: 'sent', occurredAt: '2026-01-01', source: 'manual' }
  const local = { id: 'local', company: 'Fixture Équipe', title: 'Développeur', location: 'Paris', history: [], status: 'entretien', events: [sent, interview] }
  const csv = csvFor([row()])
  const [adopted] = reconcileRegister(previewRegister(csv, [local]), [local], [{ rowKey: '1', targetId: 'local' }])
  validateRegisterProjection(adopted)
  assert.equal(funnelMetrics([adopted]).interviews, 1)
  assert.equal(funnelMetrics([adopted]).sent, 1)
  assert.deepEqual(adopted.register.retainedEvents, [sent, interview])
  const refreshedCsv = csvFor([row({ notes: 'new source note', date_candidature: '2026-01-02' })])
  const [refreshed] = reconcileRegister(previewRegister(refreshedCsv, [adopted]), [adopted], [{ rowKey: '1', targetId: 'local' }])
  validateRegisterProjection(refreshed)
  assert.deepEqual(refreshed.register.retainedEvents, [sent, interview])
  assert.equal(funnelMetrics([refreshed]).interviews, 1)
  assert.equal(funnelMetrics([refreshed]).sent, 1)
  assert.ok(refreshed.events.some((event) => event.id === interview.id))
})

test('dated legacy events without provenance remain restorable after adoption', () => {
  const local = { id: 'legacy', company: 'Fixture Équipe', title: 'Développeur', location: 'Paris',
    events: [{ id: 'dated', kind: 'interview', occurredAt: '2026-01-03' }] }
  const csv = csvFor([row()])
  const [adopted] = reconcileRegister(previewRegister(csv, [local]), [local], [{ rowKey: '1', targetId: 'legacy' }])
  validateRegisterProjection(adopted)
  assert.deepEqual(adopted.register.retainedEvents, [{ ...local.events[0], source: 'legacy-date' }])
})
