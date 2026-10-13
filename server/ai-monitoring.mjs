import { randomUUID } from 'node:crypto'

export const PURPOSES = ['offer-extraction', 'cv-analysis', 'letter-generation', 'cv-structuring', 'offer-qualification']
export const STATUSES = ['in-progress', 'success', 'error', 'uncertain']
const MODEL = /^[\w./:-]{1,120}$/
const validModel = (value) => typeof value === 'string' && MODEL.test(value)
const iso = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
const count = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 1e9
const object = (value) => value && typeof value === 'object' && !Array.isArray(value)
const only = (value, fields) => object(value) && Object.keys(value).every((key) => fields.includes(key))
const bad = () => Object.assign(new Error('Paramètres du monitoring invalides.'), { status: 400 })
const tariffFields = ['id', 'provider', 'model', 'currency', 'effectiveAt', 'verifiedAt', 'source', 'inputMilliUsd', 'outputMilliUsd', 'cachedInputMilliUsd']
const officialSource = (provider, value) => {
  try {
    if (typeof value !== 'string' || value.length > 512) return false
    const url = new URL(value)
    return url.protocol === 'https:' && !url.port && !url.username && !url.password && !url.search && !url.hash && ['mistral', 'zai'].includes(provider) && url.hostname === (provider === 'mistral' ? 'docs.mistral.ai' : 'docs.z.ai')
  } catch { return false }
}
export function validateTariff(value) {
  if (!only(value, tariffFields) || typeof value.id !== 'string' || !/^[\w-]{1,80}$/.test(value.id) || !['mistral', 'zai'].includes(value.provider) || !validModel(value.model) || value.currency !== 'USD' || !iso(value.effectiveAt) || !iso(value.verifiedAt) || !officialSource(value.provider, value.source) || !Number.isSafeInteger(value.inputMilliUsd) || value.inputMilliUsd < 0 || value.inputMilliUsd > 1e7 || !Number.isSafeInteger(value.outputMilliUsd) || value.outputMilliUsd < 0 || value.outputMilliUsd > 1e7 || (value.cachedInputMilliUsd !== null && (!Number.isSafeInteger(value.cachedInputMilliUsd) || value.cachedInputMilliUsd < 0 || value.cachedInputMilliUsd > value.inputMilliUsd))) throw bad()
  return value
}
export function validateBudget(value) {
  if (!only(value, ['monthlyLimitCents']) || (value.monthlyLimitCents !== null && (!Number.isSafeInteger(value.monthlyLimitCents) || value.monthlyLimitCents < 0 || value.monthlyLimitCents > 1e8))) throw bad()
  return value
}

// Effective dates are observation dates, not claims about earlier supplier prices.
// Aliases such as "latest" deliberately have no inferred mapping.
export const INITIAL_TARIFFS = [
  { id: 'mistral-large-2512-observed-20261008', provider: 'mistral', model: 'mistral-large-2512', currency: 'USD', effectiveAt: '2026-10-08T00:00:00.000Z', verifiedAt: '2026-10-08T00:00:00.000Z', source: 'https://docs.mistral.ai/inference/pricing', inputMilliUsd: 500, outputMilliUsd: 1500, cachedInputMilliUsd: null },
  { id: 'glm-46-observed-20261008', provider: 'zai', model: 'glm-4.6', currency: 'USD', effectiveAt: '2026-10-08T00:00:00.000Z', verifiedAt: '2026-10-08T00:00:00.000Z', source: 'https://docs.z.ai/guides/overview/pricing', inputMilliUsd: 600, outputMilliUsd: 2200, cachedInputMilliUsd: 110 },
  { id: 'mistral-large-4-sale-observed-20261008', provider: 'mistral', model: 'mistral-large-4', currency: 'USD', effectiveAt: '2026-10-08T00:00:00.000Z', verifiedAt: '2026-10-08T00:00:00.000Z', source: 'https://docs.mistral.ai/inference/pricing', inputMilliUsd: 680, outputMilliUsd: 2090, cachedInputMilliUsd: null },
]

export function initializeMonitoring(db, { seed = true } = {}) {
  db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS ai_events (id TEXT PRIMARY KEY, started_at TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS ai_events_started ON ai_events(started_at DESC, id);
      CREATE TABLE IF NOT EXISTS ai_tariffs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ai_config (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), data TEXT NOT NULL);`)
    const first = !db.prepare('SELECT singleton FROM ai_config WHERE singleton = 1').get()
    if (first) {
      db.prepare('INSERT INTO ai_config VALUES (1, ?)').run(JSON.stringify({ monthlyLimitCents: null }))
      if (seed) for (const tariff of INITIAL_TARIFFS) db.prepare('INSERT OR IGNORE INTO ai_tariffs VALUES (?, ?)').run(tariff.id, JSON.stringify(validateTariff(tariff)))
    }
  })()
}

export function normalizeUsage(provider, usage) {
  if (!object(usage)) return { state: 'absent', inputTokens: null, outputTokens: null, cachedInputTokens: null }
  const inputTokens = count(usage.prompt_tokens) ? usage.prompt_tokens : null
  const outputTokens = count(usage.completion_tokens) ? usage.completion_tokens : null
  let cachedInputTokens = null
  let valid = inputTokens !== null && outputTokens !== null
  if (usage.total_tokens !== undefined && (!count(usage.total_tokens) || usage.total_tokens !== inputTokens + outputTokens)) valid = false
  // Cached input is only normalized for the documented Z.ai response schema.
  if (provider === 'zai' && usage.prompt_tokens_details !== undefined) {
    const details = usage.prompt_tokens_details
    if (!object(details) || (details.cached_tokens !== undefined && (!count(details.cached_tokens) || details.cached_tokens > inputTokens))) valid = false
    else if (details.cached_tokens !== undefined) cachedInputTokens = details.cached_tokens
  }
  // Unknown billing categories must not silently become standard-price tokens.
  const unsupported = Object.keys(usage).some((key) => !['prompt_tokens', 'completion_tokens', 'total_tokens', ...(provider === 'zai' ? ['prompt_tokens_details'] : ['service_tier', 'prompt_audio_seconds'])].includes(key)) || (provider === 'mistral' && ((usage.service_tier != null && usage.service_tier !== 'standard') || (usage.prompt_audio_seconds != null && usage.prompt_audio_seconds !== 0))) || (object(usage.prompt_tokens_details) && Object.keys(usage.prompt_tokens_details).some((key) => key !== 'cached_tokens'))
  return { state: valid ? (unsupported ? 'unsupported' : 'valid') : 'invalid', inputTokens, outputTokens, cachedInputTokens }
}

export function estimateCost(usage, tariff) {
  if (usage.state !== 'valid') return { costNanoUsd: null, costReason: `usage-${usage.state}`, tariff: null }
  if (!tariff) return { costNanoUsd: null, costReason: 'tariff-unknown', tariff: null }
  if (usage.cachedInputTokens > 0 && tariff.cachedInputMilliUsd === null) return { costNanoUsd: null, costReason: 'category-unknown', tariff: null }
  const cached = usage.cachedInputTokens ?? 0
  // Integer nanodollars: tokens * milli-USD per million tokens, with no rounding.
  const cost = BigInt(usage.inputTokens - cached) * BigInt(tariff.inputMilliUsd) + BigInt(cached) * BigInt(tariff.cachedInputMilliUsd ?? 0) + BigInt(usage.outputTokens) * BigInt(tariff.outputMilliUsd)
  if (cost > BigInt(Number.MAX_SAFE_INTEGER)) return { costNanoUsd: null, costReason: 'amount-out-of-range', tariff: null }
  return { costNanoUsd: Number(cost), costReason: 'estimated', tariff: structuredClone(tariff) }
}

const eventFields = ['id', 'purpose', 'provider', 'requestedModel', 'returnedModel', 'startedAt', 'endedAt', 'durationMs', 'status', 'errorKind', 'usageState', 'inputTokens', 'outputTokens', 'cachedInputTokens', 'costNanoUsd', 'costReason', 'tariff']
const reasons = ['in-progress', 'interrupted', 'usage-absent', 'usage-invalid', 'usage-unsupported', 'tariff-unknown', 'category-unknown', 'amount-out-of-range', 'model-unknown', 'estimated']
export function validateEvent(value) {
  if (!only(value, eventFields) || !/^[0-9a-f-]{36}$/.test(value.id ?? '') || !PURPOSES.includes(value.purpose) || !['mistral', 'zai'].includes(value.provider) || !validModel(value.requestedModel) || (value.returnedModel !== null && !validModel(value.returnedModel)) || !iso(value.startedAt) || (value.endedAt !== null && (!iso(value.endedAt) || value.endedAt < value.startedAt)) || (value.durationMs !== null && (!Number.isSafeInteger(value.durationMs) || value.durationMs < 0)) || !STATUSES.includes(value.status) || ![null, 'provider', 'response', 'transport', 'timeout', 'restart'].includes(value.errorKind) || !['pending', 'absent', 'invalid', 'unsupported', 'valid'].includes(value.usageState) || !reasons.includes(value.costReason) || [value.inputTokens, value.outputTokens, value.cachedInputTokens].some((n) => n !== null && !count(n)) || (value.costNanoUsd !== null && (!Number.isSafeInteger(value.costNanoUsd) || value.costNanoUsd < 0))) throw bad()
  if (value.tariff !== null) validateTariff(value.tariff)
  if (value.status === 'in-progress' && (value.endedAt !== null || value.durationMs !== null || value.errorKind !== null || value.usageState !== 'pending' || value.costReason !== 'in-progress' || value.costNanoUsd !== null)) throw bad()
  if (value.status === 'success' && (value.errorKind !== null || value.endedAt === null || value.durationMs === null)) throw bad()
  if (value.status === 'error' && (!['provider', 'response'].includes(value.errorKind) || value.endedAt === null || value.durationMs === null)) throw bad()
  if (value.status === 'uncertain' && (!['transport', 'timeout', 'restart'].includes(value.errorKind) || value.costNanoUsd !== null || value.costReason !== 'interrupted')) throw bad()
  if (value.costNanoUsd !== null) {
    if (value.status === 'in-progress' || value.status === 'uncertain' || value.usageState !== 'valid' || value.costReason !== 'estimated' || !value.tariff || value.tariff.provider !== value.provider || value.tariff.model !== value.returnedModel || value.tariff.effectiveAt > value.startedAt || value.inputTokens === null || value.outputTokens === null || value.cachedInputTokens > value.inputTokens) throw bad()
    if (estimateCost({ state: value.usageState, inputTokens: value.inputTokens, outputTokens: value.outputTokens, cachedInputTokens: value.cachedInputTokens }, value.tariff).costNanoUsd !== value.costNanoUsd) throw bad()
  } else if (value.costReason === 'estimated' || value.tariff !== null) throw bad()
  return value
}

export function validateMonitoringSnapshot(value) {
  if (!only(value, ['events', 'tariffs', 'config']) || !Array.isArray(value.events) || !Array.isArray(value.tariffs)) throw bad()
  validateBudget(value.config)
  for (const [rows, validate] of [[value.events, validateEvent], [value.tariffs, validateTariff]]) {
    rows.forEach(validate)
    if (new Set(rows.map((row) => row.id)).size !== rows.length) throw bad()
  }
  return value
}
export function monitoringSnapshot(db) {
  return {
    events: db.prepare('SELECT data FROM ai_events ORDER BY id').all().map((row) => JSON.parse(row.data)),
    tariffs: db.prepare('SELECT data FROM ai_tariffs ORDER BY id').all().map((row) => JSON.parse(row.data)),
    config: JSON.parse(db.prepare('SELECT data FROM ai_config WHERE singleton = 1').get().data),
  }
}
export function restoreMonitoring(db, value) {
  initializeMonitoring(db, { seed: false })
  validateMonitoringSnapshot(value)
  for (const [table, rows] of [['ai_tariffs', value.tariffs], ['ai_events', value.events]]) {
    for (const row of rows) {
      if (table === 'ai_events') db.prepare('INSERT INTO ai_events VALUES (?, ?, ?)').run(row.id, row.startedAt, JSON.stringify(row))
      else db.prepare('INSERT INTO ai_tariffs VALUES (?, ?)').run(row.id, JSON.stringify(row))
    }
  }
  db.prepare('UPDATE ai_config SET data = ? WHERE singleton = 1').run(JSON.stringify(value.config))
}

export function createMonitoring(db) {
  initializeMonitoring(db)
  // Only performed on startup. The supplier's outcome and duration are unknowable.
  db.transaction(() => {
    for (const row of db.prepare("SELECT data FROM ai_events WHERE json_extract(data, '$.status') = 'in-progress'").all()) {
      const event = JSON.parse(row.data)
      event.status = 'uncertain'; event.errorKind = 'restart'; event.costReason = 'interrupted'
      db.prepare('UPDATE ai_events SET data = ? WHERE id = ?').run(JSON.stringify(event), event.id)
    }
  })()
  const config = () => ({ ...JSON.parse(db.prepare('SELECT data FROM ai_config WHERE singleton = 1').get().data), tariffs: db.prepare('SELECT data FROM ai_tariffs ORDER BY id').all().map((row) => JSON.parse(row.data)) })
  const begin = ({ purpose, provider, model }) => {
    const event = { id: randomUUID(), purpose, provider, requestedModel: model, returnedModel: null, startedAt: new Date().toISOString(), endedAt: null, durationMs: null, status: 'in-progress', errorKind: null, usageState: 'pending', inputTokens: null, outputTokens: null, cachedInputTokens: null, costNanoUsd: null, costReason: 'in-progress', tariff: null }
    const tariffs = config().tariffs.filter((rate) => rate.effectiveAt <= event.startedAt)
    validateEvent(event)
    db.transaction(() => {
      db.prepare('INSERT INTO ai_events VALUES (?, ?, ?)').run(event.id, event.startedAt, JSON.stringify(event))
      if (db.prepare('SELECT data FROM ai_events WHERE id = ?').get(event.id)?.data !== JSON.stringify(event)) throw new Error('Attempt readback failed.')
    })()
    return { event, tariffs, started: performance.now() }
  }
  const finish = (attempt, { status, errorKind = null, response, secret }) => {
    const event = { ...attempt.event, endedAt: new Date().toISOString(), durationMs: Math.max(0, Math.round(performance.now() - attempt.started)), status, errorKind }
    // Never retain raw provider errors, response IDs, bodies or usage objects.
    event.returnedModel = validModel(response?.model) && !(secret && response.model.includes(secret)) ? response.model : null
    const usage = normalizeUsage(event.provider, response?.usage)
    event.usageState = usage.state
    event.inputTokens = usage.inputTokens; event.outputTokens = usage.outputTokens; event.cachedInputTokens = usage.cachedInputTokens
    const tariff = attempt.tariffs.filter((rate) => rate.provider === event.provider && rate.model === event.returnedModel).sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt) || b.id.localeCompare(a.id))[0]
    Object.assign(event, status === 'uncertain' ? { costNanoUsd: null, costReason: 'interrupted', tariff: null } : !event.returnedModel && usage.state === 'valid' ? { costNanoUsd: null, costReason: 'model-unknown', tariff: null } : estimateCost(usage, tariff))
    validateEvent(event)
    db.transaction(() => {
      if (db.prepare('UPDATE ai_events SET data = ? WHERE id = ?').run(JSON.stringify(event), event.id).changes !== 1) throw new Error('Attempt missing.')
      if (db.prepare('SELECT data FROM ai_events WHERE id = ?').get(event.id)?.data !== JSON.stringify(event)) throw new Error('Outcome readback failed.')
    })()
    return event
  }
  const addTariff = (body) => {
    if (!only(body, [...tariffFields.filter((key) => !['id', 'verifiedAt'].includes(key)), 'sourceVerified']) || body.sourceVerified !== true) throw bad()
    const { sourceVerified: _verified, ...fields } = body
    const rate = validateTariff({ ...fields, id: randomUUID(), verifiedAt: new Date().toISOString() })
    if (db.prepare("SELECT id FROM ai_tariffs WHERE json_extract(data, '$.provider') = ? AND json_extract(data, '$.model') = ? AND json_extract(data, '$.effectiveAt') = ?").get(rate.provider, rate.model, rate.effectiveAt)) throw Object.assign(new Error('Une version existe déjà pour ce modèle à cette date.'), { status: 400 })
    db.prepare('INSERT INTO ai_tariffs VALUES (?, ?)').run(rate.id, JSON.stringify(rate))
    return config()
  }
  const setBudget = (body) => { validateBudget(body); db.prepare('UPDATE ai_config SET data = ? WHERE singleton = 1').run(JSON.stringify(body)); return config() }
  const selection = (query) => {
    if (!only(query, ['from', 'to', 'purpose', 'provider', 'model', 'status', 'cost', 'page', 'pageSize'])) throw bad()
    const clauses = [], params = []
    for (const [key, op] of [['from', '>='], ['to', '<']]) if (query[key] !== undefined && query[key] !== '') { if (!iso(query[key])) throw bad(); clauses.push(`started_at ${op} ?`); params.push(query[key]) }
    if (query.from && query.to && query.from >= query.to) throw bad()
    for (const [field, allowed] of [['purpose', PURPOSES], ['provider', ['mistral', 'zai']], ['status', STATUSES]]) if (query[field]) { if (!allowed.includes(query[field])) throw bad(); clauses.push(`json_extract(data, '$.${field}') = ?`); params.push(query[field]) }
    if (query.model) { if (typeof query.model !== 'string' || !MODEL.test(query.model)) throw bad(); clauses.push("(json_extract(data, '$.requestedModel') = ? OR json_extract(data, '$.returnedModel') = ?)"); params.push(query.model, query.model) }
    if (query.cost) {
      if (!['unknown', 'estimated'].includes(query.cost)) throw bad()
      clauses.push(`json_extract(data, '$.costNanoUsd') IS ${query.cost === 'estimated' ? 'NOT ' : ''}NULL`)
    }
    return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
  }
  const history = (query) => {
    const { where, params } = selection(query)
    const page = Number(query.page ?? 1), pageSize = Number(query.pageSize ?? 20)
    if (!Number.isSafeInteger(page) || page < 1 || page > 1e7 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw bad()
    const total = db.prepare(`SELECT COUNT(*) AS n FROM ai_events ${where}`).get(...params).n
    const events = db.prepare(`SELECT data FROM ai_events ${where} ORDER BY started_at DESC, id DESC LIMIT ? OFFSET ?`).all(...params, pageSize, (page - 1) * pageSize).map((row) => JSON.parse(row.data))
    return { events, total, page, pageSize }
  }
  const aggregate = (query = {}) => {
    const { where, params } = selection(query)
    let cost = 0n, input = 0n, output = 0n, known = 0, unknown = 0, errors = 0, usageUnknown = 0
    const groups = new Map()
    for (const row of db.prepare(`SELECT data FROM ai_events ${where}`).iterate(...params)) {
      const event = JSON.parse(row.data)
      const key = JSON.stringify([event.purpose, event.provider, event.returnedModel ?? event.requestedModel])
      const group = groups.get(key) ?? { purpose: event.purpose, provider: event.provider, model: event.returnedModel ?? event.requestedModel, known: 0, unknown: 0, cost: 0n }
      if (event.costNanoUsd === null) { unknown++; group.unknown++ } else { known++; group.known++; cost += BigInt(event.costNanoUsd); group.cost += BigInt(event.costNanoUsd) }
      if (['error', 'uncertain'].includes(event.status)) errors++
      if (event.inputTokens === null || event.outputTokens === null) usageUnknown++
      input += BigInt(event.inputTokens ?? 0); output += BigInt(event.outputTokens ?? 0)
      groups.set(key, group)
    }
    return { currency: 'USD', estimatedNanoUsd: cost.toString(), known, unknown, errors, usageUnknown, inputTokens: input.toString(), outputTokens: output.toString(), breakdown: Array.from(groups.values(), ({ cost, ...group }) => ({ ...group, estimatedNanoUsd: cost.toString() })) }
  }
  const budget = () => {
    const now = new Date(), start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    const summary = aggregate({ from: start.toISOString(), to: end.toISOString() })
    const monthlyLimitCents = config().monthlyLimitCents
    return { ...summary, month: start.toISOString().slice(0, 7), monthlyLimitCents, exceeded: monthlyLimitCents !== null && BigInt(summary.estimatedNanoUsd) > BigInt(monthlyLimitCents) * 10000000n, uncertain: monthlyLimitCents !== null && summary.unknown > 0 }
  }
  return { begin, finish, config, addTariff, setBudget, history, aggregate, budget }
}
