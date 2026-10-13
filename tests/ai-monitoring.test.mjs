import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { createServer, request } from 'node:http'
import { randomUUID, createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../server/app.mjs'
import { createMonitoring, normalizeUsage, estimateCost, monitoringSnapshot, validateMonitoringSnapshot, INITIAL_TARIFFS } from '../server/ai-monitoring.mjs'
import { createWriteCoordinator } from '../server/writes.mjs'
import { exportSnapshot, restoreSnapshot } from '../server/snapshots.mjs'
import { usd, tokenNumber } from '../src/ai-format.mjs'

const tariff = { ...INITIAL_TARIFFS[1], effectiveAt: '2020-01-01T00:00:00.000Z' }
const usage = { prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200, prompt_tokens_details: { cached_tokens: 400 } }
const body = { prompt: 'private CV prompt fixture', purpose: 'cv-analysis', baseUrl: 'https://api.z.ai/api/paas/v4', model: 'glm-4.6' }
const answer = (changes = {}) => ({ model: 'glm-4.6', usage, choices: [{ message: { content: 'private generated letter fixture' } }], ...changes })
const secret = 'test-only-provider-secret'
async function fixture(t, fetchProvider) {
  const db = new Database(':memory:')
  const server = createServer()
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const port = server.address().port
  // Fixture-only reversible protector; never used by production.
  const result = createApp({ db, port, protector: { protect: (s) => Buffer.from(s).toString('base64'), unprotect: (s) => Buffer.from(s, 'base64').toString() }, fetchProvider: (...args) => fetchProvider(db, ...args) })
  result.credentials.set('zai', secret); result.credentials.set('mistral', secret)
  db.prepare('UPDATE ai_tariffs SET data = ? WHERE id = ?').run(JSON.stringify(tariff), tariff.id)
  server.on('request', result.app)
  t.after(async () => { server.closeAllConnections(); await new Promise((done) => server.close(done)); db.close() })
  const revision = () => db.prepare('SELECT revision FROM persistence_revision').get().revision
  function call(path, { method = 'GET', body, headers = {}, authenticated = true } = {}) {
    return new Promise((done, reject) => {
      const req = request({ host: '127.0.0.1', port, path: `/api/${path}`, method, headers: {
        ...(authenticated ? { 'X-JobPilot-Session': result.token } : {}), 'X-JobPilot-Revision': String(revision()), 'X-JobPilot-Operation': randomUUID(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers,
      } }, (res) => { let text = ''; res.on('data', (chunk) => { text += chunk }); res.on('end', () => done({ status: res.statusCode, data: JSON.parse(text) })) })
      req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body))
    })
  }
  return { db, call, revision }
}
const events = (db) => monitoringSnapshot(db).events

test('provider refusal exposes safe diagnostics, correlates the attempt and never retries', async (t) => {
  let calls = 0
  const trace = '12345678-1234-1234-1234-123456789abc'
  const { db, call } = await fixture(t, async () => {
    calls++
    return Response.json({ code: 'tier_not_allowed', message: `${secret} ${body.prompt}` }, { status: 403, headers: { 'x-request-id': trace } })
  })
  const response = await call('ai', { method: 'POST', body })
  assert.equal(response.status, 502); assert.equal(calls, 1)
  assert.ok(response.data.error.includes('tier_not_allowed')); assert.ok(response.data.error.includes(trace))
  assert.ok(response.data.error.includes(events(db)[0].id))
  for (const privateValue of [secret, body.prompt]) assert.ok(!JSON.stringify(response).includes(privateValue))
  assert.equal(events(db)[0].status, 'error')
})

test('durable attempt precedes dispatch; outcome excludes all private content and leaves revisions untouched', async (t) => {
  let calls = 0
  const { db, call, revision } = await fixture(t, async (db) => {
    calls++
    const [event] = events(db)
    assert.equal(event.status, 'in-progress'); assert.equal(event.costNanoUsd, null)
    assert.equal(db.prepare('SELECT revision FROM persistence_revision').get().revision, 0)
    return Response.json(answer({ metadata: { apiKey: secret, cv: body.prompt } }))
  })
  const response = await call('ai', { method: 'POST', body })
  assert.equal(response.status, 200); assert.equal(response.data.content, answer().choices[0].message.content)
  assert.equal(calls, 1); assert.equal(revision(), 0)
  const [event] = events(db)
  assert.equal(event.status, 'success'); assert.equal(event.costNanoUsd, 844000)
  assert.equal(event.cachedInputTokens, 400); assert.ok(event.durationMs >= 0)
  assert.equal(event.tariff.id, tariff.id)
  const journal = JSON.stringify(event)
  for (const value of [secret, body.prompt, answer().choices[0].message.content, 'metadata', 'apiKey']) assert.equal(journal.includes(value), false)
  assert.equal((await call('applications/example', { method: 'PUT', body: { id: 'example' }, headers: { 'X-JobPilot-Revision': '0' } })).status, 200)
})

test('missing, malformed and unsupported usage never create zero costs', async (t) => {
  const cases = [undefined, {}, { prompt_tokens: -1, completion_tokens: 4 }, { prompt_tokens: '10', completion_tokens: 4 }, { prompt_tokens: 4, completion_tokens: 5, total_tokens: 3 }, { ...usage, prompt_tokens_details: { cached_tokens: 1001 } }, { ...usage, extra_paid_tokens: 10 }]
  let next
  const { db, call } = await fixture(t, async () => Response.json(answer({ usage: next })))
  for (next of cases) {
    assert.equal((await call('ai', { method: 'POST', body })).status, 200)
    const last = db.prepare('SELECT data FROM ai_events ORDER BY rowid DESC LIMIT 1').get()
    assert.equal(JSON.parse(last.data).costNanoUsd, null)
  }
  assert.equal((await call('ai/summary')).data.unknown, cases.length)
})

test('returned model controls pricing; no requested-model fallback or synthetic usage', async (t) => {
  let model = 'unpriced-model'
  const { db, call } = await fixture(t, async () => Response.json(answer({ model })))
  await call('ai', { method: 'POST', body })
  assert.equal(events(db)[0].costReason, 'tariff-unknown')
  model = undefined; await call('ai', { method: 'POST', body })
  assert.equal(events(db).find((event) => event.returnedModel === null).costReason, 'model-unknown')
  model = secret; await call('ai', { method: 'POST', body })
  assert.equal(JSON.stringify(events(db)).includes(secret), false)
  const rate = { ...tariff, model: 'glm-4.5-air', inputMilliUsd: 200, outputMilliUsd: 1100, cachedInputMilliUsd: 30 }
  await call('ai/tariffs', { method: 'POST', body: { ...Object.fromEntries(Object.entries(rate).filter(([key]) => !['id', 'verifiedAt'].includes(key))), sourceVerified: true } })
  model = 'glm-4.5-air'; await call('ai', { method: 'POST', body })
  const changed = events(db).find((event) => event.returnedModel === model)
  assert.equal(changed.requestedModel, 'glm-4.6'); assert.equal(changed.costNanoUsd, 352000)
})

test('Mistral text usage supports only verified standard categories', async (t) => {
  const rate = { ...INITIAL_TARIFFS[0], effectiveAt: '2020-01-01T00:00:00.000Z' }
  let supplied = { prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200, prompt_audio_seconds: null, service_tier: 'standard' }
  const { db, call } = await fixture(t, async () => Response.json(answer({ model: rate.model, usage: supplied })))
  db.prepare('UPDATE ai_tariffs SET data = ? WHERE id = ?').run(JSON.stringify(rate), rate.id)
  const request = { ...body, baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-large-latest' }
  await call('ai', { method: 'POST', body: request })
  assert.equal(events(db)[0].costNanoUsd, 800000)
  supplied = { ...supplied, service_tier: 'priority' }; await call('ai', { method: 'POST', body: request })
  assert.equal(events(db).filter((e) => e.costNanoUsd === null).length, 1)
})

test('errors, malformed response and timeout are sanitized, unknown and never retried', async (t) => {
  let mode = 'error', calls = 0
  const { db, call } = await fixture(t, async () => {
    calls++
    if (mode === 'error') return new Response(secret, { status: 500 })
    if (mode === 'error-usage') return Response.json(answer({ error: { message: secret } }), { status: 400 })
    if (mode === 'invalid-json') return new Response('not-json', { status: 200 })
    if (mode === 'invalid-content') return Response.json(answer({ choices: [] }))
    throw Object.assign(new Error(secret), { name: 'TimeoutError' })
  })
  for (mode of ['error', 'error-usage', 'invalid-json', 'invalid-content', 'timeout']) {
    const result = await call('ai', { method: 'POST', body })
    assert.equal(result.status, 502); assert.equal(JSON.stringify(result).includes(secret), false)
  }
  assert.equal(calls, 5)
  const all = events(db)
  assert.equal(all.find((e) => e.errorKind === 'provider' && e.usageState === 'absent').costNanoUsd, null)
  assert.equal(all.find((e) => e.errorKind === 'provider' && e.usageState === 'valid').costNanoUsd, 844000)
  assert.equal(all.find((e) => e.errorKind === 'timeout').status, 'uncertain')
  assert.equal(all.find((e) => e.errorKind === 'response' && e.usageState === 'valid').costNanoUsd, 844000)
  assert.equal(all.find((e) => e.errorKind === 'response' && e.usageState === 'absent').costNanoUsd, null)
  assert.equal(JSON.stringify(all).includes(secret), false)
})

test('failed journal insert or readback refuses dispatch and rolls back the attempt', async (t) => {
  let calls = 0
  const { db, call } = await fixture(t, async () => { calls++; return Response.json(answer()) })
  db.exec("CREATE TRIGGER fail_attempt BEFORE INSERT ON ai_events BEGIN SELECT RAISE(ABORT, 'fixture'); END")
  assert.equal((await call('ai', { method: 'POST', body })).status, 503)
  db.exec('DROP TRIGGER fail_attempt')
  db.exec('CREATE TRIGGER remove_attempt AFTER INSERT ON ai_events BEGIN DELETE FROM ai_events WHERE id = new.id; END')
  assert.equal((await call('ai', { method: 'POST', body })).status, 503)
  assert.equal(calls, 0); assert.equal(events(db).length, 0)
})

test('failed final logging preserves pending uncertainty and successful content without a paid retry', async (t) => {
  let calls = 0
  const { db, call, revision } = await fixture(t, async () => { calls++; return Response.json(answer()) })
  db.exec("CREATE TRIGGER fail_finish BEFORE UPDATE ON ai_events BEGIN SELECT RAISE(ABORT, 'fixture'); END")
  const result = await call('ai', { method: 'POST', body })
  assert.equal(result.status, 200); assert.ok(result.data.monitoringWarning)
  assert.equal(result.data.content, answer().choices[0].message.content)
  assert.equal(calls, 1); assert.equal(events(db)[0].status, 'in-progress')
  db.exec('DROP TRIGGER fail_finish'); createMonitoring(db)
  assert.equal(events(db)[0].status, 'uncertain'); assert.equal(events(db)[0].errorKind, 'restart')
  assert.equal(events(db)[0].durationMs, null); assert.equal(events(db)[0].costNanoUsd, null)
  assert.equal(revision(), 0); assert.equal(calls, 1)
})

test('pricing snapshots remain unchanged after new versions, including in-flight configuration changes', () => {
  const db = new Database(':memory:')
  try {
    const monitor = createMonitoring(db)
    db.prepare('UPDATE ai_tariffs SET data = ? WHERE id = ?').run(JSON.stringify(tariff), tariff.id)
    const attempt = monitor.begin({ purpose: 'cv-analysis', provider: 'zai', model: 'glm-4.6' })
    monitor.addTariff({ ...Object.fromEntries(Object.entries(tariff).filter(([key]) => !['id', 'verifiedAt'].includes(key))), effectiveAt: '2025-01-01T00:00:00.000Z', inputMilliUsd: 2000, sourceVerified: true })
    monitor.finish(attempt, { status: 'success', response: answer(), secret })
    const event = events(db)[0]
    assert.equal(event.costNanoUsd, 844000); assert.equal(event.tariff.inputMilliUsd, 600)
    monitor.finish(monitor.begin({ purpose: 'letter-generation', provider: 'zai', model: 'glm-4.6' }), { status: 'success', response: answer(), secret })
    assert.equal(events(db).find((e) => e.purpose === 'letter-generation').costNanoUsd, 1684000)
    assert.deepEqual(events(db).find((e) => e.id === event.id), event)
  } finally { db.close() }
})

test('integer pricing distinguishes real zero, cache, tiny costs and unsupported category', () => {
  const normalized = normalizeUsage('zai', usage)
  assert.equal(estimateCost(normalized, tariff).costNanoUsd, 844000)
  assert.equal(estimateCost({ ...normalized, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 }, tariff).costNanoUsd, 0)
  assert.equal(estimateCost({ ...normalized, inputTokens: 1, outputTokens: 0, cachedInputTokens: null }, { ...tariff, inputMilliUsd: 1 }).costNanoUsd, 1)
  assert.equal(estimateCost(normalized, { ...tariff, cachedInputMilliUsd: null }).costReason, 'category-unknown')
  assert.equal(estimateCost(normalized, null).costNanoUsd, null)
  assert.equal(estimateCost({ state: 'absent' }, tariff).costNanoUsd, null)
  assert.equal(usd(0), '0,00 USD')
  assert.equal(usd(1), '< 0,000001 USD')
  assert.equal(usd(844000), '0,000844 USD')
  assert.equal(usd(123456789), '0,123457 USD')
  assert.equal(tokenNumber(null), 'Inconnus')
  assert.equal(tokenNumber('10000000000000001'), BigInt('10000000000000001').toLocaleString('fr-FR'))
})

test('history pagination, exact model and combined filters match aggregates and separate unknown costs', async (t) => {
  let supplied = answer()
  const { call } = await fixture(t, async () => Response.json(supplied))
  for (let i = 0; i < 23; i++) await call('ai', { method: 'POST', body: { ...body, purpose: i < 21 ? 'cv-analysis' : 'letter-generation' } })
  supplied = answer({ usage: undefined }); await call('ai', { method: 'POST', body: { ...body, purpose: 'offer-extraction' } })
  assert.equal((await call('ai/activity?page=1')).data.events.length, 20)
  const page2 = (await call('ai/activity?page=2')).data
  assert.equal(page2.events.length, 4); assert.equal(page2.total, 24)
  const query = 'purpose=cv-analysis&provider=zai&model=glm-4.6&status=success'
  const filtered = (await call(`ai/activity?${query}`)).data
  const summary = (await call(`ai/summary?${query}`)).data
  assert.equal(filtered.total, 21); assert.equal(summary.known, 21); assert.equal(summary.unknown, 0)
  assert.equal(summary.estimatedNanoUsd, String(21 * 844000))
  const total = (await call('ai/summary')).data
  assert.equal(total.unknown, 1); assert.equal(total.known, 23)
  assert.equal(total.breakdown.find((group) => group.purpose === 'offer-extraction').unknown, 1)
  assert.equal((await call('ai/activity?cost=unknown')).data.total, 1)
  assert.equal((await call('ai/summary?cost=estimated')).data.known, 23)
  assert.equal((await call('ai/activity?from=2099-01-01T00%3A00%3A00.000Z')).data.total, 0)
  for (const query of ['page=0', 'pageSize=101', 'purpose=other', 'provider=other', 'status=other', 'model=a%27%20OR%201', 'from=invalid', 'unknown=1', 'provider=zai&provider=mistral']) assert.equal((await call(`ai/activity?${query}`)).status, 400)
})

test('monthly threshold is disabled by default, ignores filters and never blocks a paid attempt', async (t) => {
  let supplied = answer()
  const { db, call } = await fixture(t, async () => Response.json(supplied))
  assert.equal((await call('ai/budget')).data.monthlyLimitCents, null)
  await call('ai/config', { method: 'PUT', body: { monthlyLimitCents: 1 } })
  for (let i = 0; i < 12; i++) await call('ai', { method: 'POST', body })
  let budget = (await call('ai/budget')).data
  assert.equal(budget.exceeded, true); assert.equal(budget.uncertain, false)
  supplied = answer({ usage: undefined }); assert.equal((await call('ai', { method: 'POST', body })).status, 200)
  budget = (await call('ai/budget')).data
  assert.equal(budget.uncertain, true)
  const older = { ...events(db)[0], id: randomUUID(), startedAt: '2020-01-01T00:00:00.000Z', endedAt: '2020-01-01T00:00:01.000Z' }
  db.prepare('INSERT INTO ai_events VALUES (?, ?, ?)').run(older.id, older.startedAt, JSON.stringify(older))
  assert.equal((await call('ai/budget')).data.known + (await call('ai/budget')).data.unknown, 13)
  await call('ai/config', { method: 'PUT', body: { monthlyLimitCents: null } })
  assert.equal((await call('ai/budget')).data.uncertain, false)
})

test('monthly budget uses UTC boundaries and does not alert at exact equality', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-15T12:00:00.000Z') })
  const db = new Database(':memory:')
  try {
    const monitor = createMonitoring(db)
    monitor.setBudget({ monthlyLimitCents: 1 })
    const rate = { ...INITIAL_TARIFFS[0], model: 'fixture', effectiveAt: '2026-09-01T00:00:00.000Z', inputMilliUsd: 1000, outputMilliUsd: 0 }
    const event = { id: randomUUID(), purpose: 'cv-analysis', provider: 'mistral', requestedModel: 'fixture', returnedModel: 'fixture', startedAt: '2026-10-01T00:00:00.000Z', endedAt: '2026-10-01T00:00:01.000Z', durationMs: 1000, status: 'success', errorKind: null, usageState: 'valid', inputTokens: 10000, outputTokens: 0, cachedInputTokens: null, costNanoUsd: 10000000, costReason: 'estimated', tariff: rate }
    const insert = (row) => db.prepare('INSERT INTO ai_events VALUES (?, ?, ?)').run(row.id, row.startedAt, JSON.stringify(row))
    insert(event)
    for (const startedAt of ['2026-09-30T23:59:59.999Z', '2026-11-01T00:00:00.000Z']) insert({ ...event, id: randomUUID(), startedAt, endedAt: startedAt })
    assert.equal(monitor.budget().known, 1); assert.equal(monitor.budget().exceeded, false)
    monitor.setBudget({ monthlyLimitCents: 0 }); assert.equal(monitor.budget().exceeded, true)
    monitor.setBudget({ monthlyLimitCents: 1 })
    insert({ ...event, id: randomUUID(), startedAt: '2026-10-31T23:59:59.999Z', endedAt: '2026-10-31T23:59:59.999Z' })
    assert.equal(monitor.budget().known, 2); assert.equal(monitor.budget().exceeded, true)
  } finally { db.close() }
})

test('config writes require revisions and confirmations; monitoring routes are local-session protected', async (t) => {
  const { call, revision } = await fixture(t, async () => Response.json(answer()))
  for (const [path, method] of [['ai/activity', 'GET'], ['ai/summary', 'GET'], ['ai/config', 'GET'], ['ai/budget', 'GET'], ['ai/config', 'PUT'], ['ai/tariffs', 'POST']]) assert.equal((await call(path, { method, authenticated: false, ...(method === 'GET' ? {} : { body: {} }) })).status, 401)
  const operation = randomUUID(), headers = { 'X-JobPilot-Revision': '0', 'X-JobPilot-Operation': operation }
  const saved = await call('ai/config', { method: 'PUT', body: { monthlyLimitCents: 1200 }, headers })
  assert.equal(saved.data.ok, true); assert.equal(saved.data.revision, 1)
  assert.deepEqual((await call('ai/config', { method: 'PUT', body: { monthlyLimitCents: 1200 }, headers })).data, saved.data)
  assert.equal((await call('ai/config', { method: 'PUT', body: { monthlyLimitCents: 999 }, headers: { 'X-JobPilot-Revision': '0' } })).status, 409)
  for (const monthlyLimitCents of [-1, '1', 0.1]) assert.equal((await call('ai/config', { method: 'PUT', body: { monthlyLimitCents } })).status, 400)
  const newRate = { ...Object.fromEntries(Object.entries(tariff).filter(([key]) => !['id', 'verifiedAt'].includes(key))), effectiveAt: '2025-01-01T00:00:00.000Z', sourceVerified: true }
  assert.equal((await call('ai/tariffs', { method: 'POST', body: { ...newRate, source: 'https://attacker.example/' } })).status, 400)
  assert.equal((await call('ai/tariffs', { method: 'POST', body: { ...newRate, sourceVerified: false } })).status, 400)
  assert.equal((await call('ai/tariffs', { method: 'POST', body: newRate })).status, 200)
  assert.equal((await call('ai/tariffs', { method: 'POST', body: newRate })).status, 400)
  assert.equal(revision(), 2)
  assert.equal((await call('ai', { method: 'POST', body: { ...body, purpose: undefined } })).status, 400)
})

test('portable v2 preserves monitoring, v1 restores without fabricating historical events, unsafe journals are refused', async (t) => {
  const { db, call } = await fixture(t, async () => Response.json(answer()))
  await call('ai', { method: 'POST', body }); await call('ai/config', { method: 'PUT', body: { monthlyLimitCents: 1500 } })
  const directory = mkdtempSync(join(tmpdir(), 'jobpilot-ai-restore-'))
  t.after(() => { for (const name of readdirSync(directory)) unlinkSync(join(directory, name)); rmdirSync(directory) })
  const snapshot = exportSnapshot(db, { cvText: 'profile CV belongs outside telemetry' }, 2)
  assert.equal(snapshot.version, 2)
  const destination = join(directory, 'v2.db'); restoreSnapshot(snapshot, destination)
  const restored = new Database(destination)
  try {
    assert.deepEqual(monitoringSnapshot(restored), snapshot.payload.monitoring)
    assert.equal(createMonitoring(restored).aggregate().estimatedNanoUsd, '844000')
  } finally { restored.close() }
  const legacy = exportSnapshot(db, { cvText: 'legacy CV' }, 1)
  const oldDestination = join(directory, 'v1.db'); restoreSnapshot(legacy, oldDestination)
  const oldDb = new Database(oldDestination)
  try { createWriteCoordinator(oldDb); createMonitoring(oldDb); assert.equal(events(oldDb).length, 0) } finally { oldDb.close() }
  const malicious = structuredClone(snapshot)
  malicious.payload.monitoring.events[0].prompt = 'sensitive-content'
  malicious.checksum = createHash('sha256').update(JSON.stringify(malicious.payload)).digest('hex')
  const invalid = join(directory, 'invalid.db')
  assert.throws(() => restoreSnapshot(malicious, invalid)); assert.equal(existsSync(invalid), false)
  const broken = structuredClone(snapshot.payload.monitoring); broken.events[0].costNanoUsd++
  assert.throws(() => validateMonitoringSnapshot(broken))
})
