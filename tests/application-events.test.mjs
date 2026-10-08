import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applicationEvents, funnelMetrics, validEventDate, validateApplicationEvents } from '../src/application-events.mjs'

test('refusal preserves the sent denominator and previous interview', () => {
  const app = { id: 'a', status: 'refusee', events: [
    { kind: 'sent', occurredAt: '2026-01-01' },
    { kind: 'interview', occurredAt: '2026-01-04' },
    { kind: 'refusal', occurredAt: '2026-01-05' },
  ] }
  assert.equal(funnelMetrics([app]).sent, 1)
  assert.equal(funnelMetrics([app]).interviews, 1)
  assert.equal(funnelMetrics([app]).interviewRate, 100)
  assert.equal(funnelMetrics([app]).responses, 1)
})

test('legacy status never manufactures milestones or dates', () => {
  assert.deepEqual(applicationEvents({ id: 'a', status: 'offre' }), [])
  const app = { id: 'a', status: 'refusee', appliedAt: '2025-01-01' }
  assert.equal(applicationEvents(app)[0].occurredAt, '2025-01-01')
  assert.equal(funnelMetrics([app]).sent, 1)
  assert.equal(funnelMetrics([app]).interviews, 0)
  assert.equal(funnelMetrics([app]).unknownHistory, 1)
})

test('repeated responses and interviews count unique applications', () => {
  assert.equal(funnelMetrics([{ events: [{ kind: 'sent' }, { kind: 'interview' }, { kind: 'interview' }, { kind: 'response' }] }]).interviews, 1)
  assert.equal(funnelMetrics([]).responseRate, null)
})

test('only real calendar dates and bounded unambiguous event records are accepted', () => {
  for (const date of ['2026-02-29', '2026-02-30', '2026-13-01', '', null, '2026-01-01T00:00:00Z']) assert.equal(validEventDate(date), false)
  assert.equal(validEventDate('2024-02-29'), true)
  const event = { id: 'event', kind: 'sent', source: 'manual', occurredAt: '2026-01-01' }
  validateApplicationEvents({ events: [event] })
  for (const events of [[{ ...event, kind: 'invented' }], [{ ...event, source: 'guess' }], [{ ...event, occurredAt: '2026-02-30' }], [event, event], [{ ...event, extra: 'not allowed' }], {}]) {
    assert.throws(() => validateApplicationEvents({ events }), { status: 400 })
  }
  assert.throws(() => validateApplicationEvents({ eventHistoryComplete: 'yes' }), { status: 400 })
})

test('adding an event never silently makes a legacy history complete', () => {
  assert.equal(funnelMetrics([{ events: [{ kind: 'sent' }] }]).unknownHistory, 1)
  assert.equal(funnelMetrics([{ events: [], eventHistoryComplete: true }]).unknownHistory, 0)
  assert.deepEqual(applicationEvents({ id: 'broken', appliedAt: '2026-02-30' }), [])
})

test('an interview with an unknown send date remains visible but does not distort rates', () => {
  const metrics = funnelMetrics([{ events: [{ kind: 'interview' }] }, { events: [{ kind: 'sent' }] }])
  assert.equal(metrics.interviews, 1)
  assert.equal(metrics.sent, 1)
  assert.equal(metrics.interviewRate, 0)
  assert.equal(metrics.responses, 1)
})
