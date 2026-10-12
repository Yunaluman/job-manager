import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultReviewPeriod, reviewPeriods, strategyReview } from '../src/strategy-review.mjs'

const event = (kind, occurredAt) => ({ id: `${kind}:${occurredAt}`, kind, occurredAt, source: 'manual' })
const app = (id, send, events = [], extra = {}) => ({ id, company: `Fixture ${id}`, title: 'Développeur', source: 'Site carrière', events: [...(send ? [event('sent', send)] : []), ...events], ...extra })
const run = (apps, submissions = []) => strategyReview(apps, submissions, '2026-09-01', '2026-09-30', '2026-10-12')
const declaration = (id, applicationId, occurredAt, extra = {}) => ({ id, applicationId, occurredAt, ...extra })

test('completed default periods and equal inclusive comparisons use calendar days across DST and leap years', () => {
  assert.deepEqual(defaultReviewPeriod('2026-10-12'), { from: '2026-09-12', to: '2026-10-11' })
  assert.deepEqual(reviewPeriods('2024-03-01', '2024-03-31', '2024-04-01'), { current: { from: '2024-03-01', to: '2024-03-31' }, previous: { from: '2024-01-30', to: '2024-02-29' }, days: 31 })
  assert.equal(reviewPeriods('2026-10-01', '2026-10-31', '2026-11-01').days, 31)
  for (const [from, to] of [['2026-02-29', '2026-03-02'], ['bad', '2026-09-30'], ['2026-09-30', '2026-09-01'], ['2026-10-01', '2026-10-12'], ['2026-10-01', '2027-01-01']]) {
    assert.throws(() => reviewPeriods(from, to, '2026-10-12'))
  }
})

test('cohorts include their endpoints, first send wins and follow-up sends do not move dossiers', () => {
  const result = run([app('first', '2026-09-01'), app('last', '2026-09-30'), app('previous-first', '2026-08-02'), app('previous-last', '2026-08-31', [event('sent', '2026-09-02')]), app('outside', '2026-08-01')])
  assert.deepEqual(result.current.rows.map((row) => row.application.id), ['first', 'last'])
  assert.equal(result.previous.rows.length, 2)
})

test('outcomes stop at each cohort end, exclude pre-send outcomes and ignore status alone', () => {
  const result = run([
    app('a', '2026-09-02', [event('response', '2026-09-01'), event('interview', '2026-09-04'), event('interview', '2026-09-06'), event('refusal', '2026-10-01')]),
    app('b', '2026-09-30', [event('offer', '2026-09-30')]),
    app('c', '2026-09-10', [], { status: 'offre' }),
    app('d', '2026-08-10', [event('response', '2026-09-01')]),
  ])
  assert.equal(result.current.answered.length, 2)
  assert.equal(result.current.interviews.length, 1)
  assert.equal(result.current.offers.length, 1)
  assert.equal(result.current.refusals.length, 0)
  assert.equal(result.current.medianDays, 1)
  assert.equal(result.previous.answered.length, 0)
  assert.equal(result.quality.anomalies.length, 1)
  assert.equal(result.current.responseRate, 2 / 3 * 100)
  assert.deepEqual(result.current.unanswered.map((row) => row.application.id), ['c'])
})

test('declared sends, legacy dates, cancellations, same-day duplicates and orphans are reconciled without writes', () => {
  const apps = [app('a', null, [], { appliedAt: '2026-09-01' }), app('b', null), app('c', null)]
  const submissions = [declaration('1', 'a', '2026-09-01'), declaration('2', 'a', '2026-09-01'), declaration('3', 'b', '2026-09-03'), declaration('4', 'c', '2026-09-02', { cancelledAt: '2026-09-03' }), declaration('5', 'deleted', '2026-09-03'), declaration('6', 'deleted', '2026-09-03', { cancelledAt: '2026-09-04' })]
  const before = JSON.stringify({ apps, submissions })
  const result = run(apps, submissions)
  assert.equal(result.current.rows.length, 2)
  assert.deepEqual(result.quality.missingSend.map((row) => row.application.id), ['c'])
  assert.deepEqual(result.quality.orphanSubmissions.map((row) => row.id), ['5'])
  assert.equal(JSON.stringify({ apps, submissions }), before)
})

test('breakdowns reconcile to totals, normalize only case/space and preserve missing labels separately', () => {
  const result = run([
    app('a', '2026-09-01', [], { source: '  SITE   Carrière ', title: ' DEV  web ' }),
    app('b', '2026-09-02', [], { source: 'site carrière', title: 'dev web', register: { disposition: 'archived' } }),
    app('c', '2026-09-03', [], { source: '', title: '', register: { disposition: 'excluded' } }),
    app('d', '2026-08-02', [], { source: 'Non renseigné' }),
  ])
  for (const groups of [result.sources, result.titles]) {
    for (const period of ['current', 'previous']) {
      for (const metric of ['rows', 'answered', 'interviews', 'offers', 'refusals', 'unanswered']) {
        assert.equal(groups.reduce((sum, group) => sum + group[period][metric].length, 0), result[period][metric].length)
        assert.deepEqual(groups.flatMap((group) => group[period][metric].map((row) => row.application.id)).sort(), result[period][metric].map((row) => row.application.id).sort())
      }
    }
  }
  assert.equal(result.sources.length, 3)
  assert.equal(result.sources.find((group) => group.key === 'value:site carrière').current.rows.length, 2)
  assert.equal(result.quality.missingSource.length, 1)
  assert.equal(result.quality.missingTitle.length, 1)
})

test('quality remains global and exposes invalid/future dates without manufacturing sends', () => {
  const result = run([app('old', '2020-01-01'), app('no-send', null, [event('interview', '2026-09-05')], { eventHistoryComplete: true }), app('invalid', null, [event('sent', '2026-02-30'), event('response', '2026-10-13')]), app('future', '2027-01-01')])
  assert.equal(result.current.rows.length, 0)
  assert.equal(result.quality.incomplete.length, 3)
  assert.equal(result.quality.missingSend.length, 3)
  assert.equal(result.quality.anomalies.length, 2)
  assert.equal(result.current.responseRate, null)
  assert.equal(result.current.interviewRate, null)
  assert.equal(result.current.medianDays, null)
})

test('median uses only observed responses, supports odd/even sample sizes and zero-day outcomes', () => {
  const apps = [app('a', '2026-09-01', [event('response', '2026-09-01')]), app('b', '2026-09-01', [event('response', '2026-09-04')]), app('c', '2026-09-01', [event('refusal', '2026-09-09')]), app('none', '2026-09-01')]
  assert.equal(run(apps).current.medianDays, 3)
  assert.equal(run(apps.slice(0, 2)).current.medianDays, 1.5)
  assert.equal(run([]).current.medianDays, null)
})

test('response delays use calendar days rather than elapsed hours at both DST transitions', () => {
  for (const [send, response, from, to, today] of [
    ['2026-03-28', '2026-03-30', '2026-03-01', '2026-03-31', '2026-04-01'],
    ['2026-10-24', '2026-10-26', '2026-10-01', '2026-10-31', '2026-11-01'],
    ['2024-02-28', '2024-03-01', '2024-02-01', '2024-03-01', '2024-03-02'],
  ]) {
    const result = strategyReview([app('a', send, [event('response', response)])], [], from, to, today)
    assert.equal(result.current.medianDays, 2)
    assert.equal(result.current.answered[0].responseDays, 2)
  }
})
