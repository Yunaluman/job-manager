export const EVENT_KINDS = ['sent', 'response', 'interview', 'offer', 'refusal', 'followup']

export function validEventDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function validateApplicationEvents(application) {
  const fail = () => { throw Object.assign(new Error('Étapes de candidature invalides.'), { status: 400 }) }
  if (application.registerAdoptedAt !== undefined && (!application.register || typeof application.registerAdoptedAt !== 'string' || !Number.isFinite(Date.parse(application.registerAdoptedAt)))) fail()
  if (application.preparationCv !== undefined && (!application.preparationCv || !['original','version','profile'].includes(application.preparationCv.kind) || typeof application.preparationCv.id !== 'string' || !application.preparationCv.id || application.preparationCv.id.length > 200 || Object.keys(application.preparationCv).some(key=>!['kind','id'].includes(key)))) fail()
  if (application.eventHistoryComplete !== undefined && typeof application.eventHistoryComplete !== 'boolean') fail()
  if (application.events === undefined) return
  if (!Array.isArray(application.events) || application.events.length > 1000) fail()
  const ids = new Set()
  for (const event of application.events) {
    if (!event || typeof event !== 'object' || Array.isArray(event) || Object.keys(event).some((key) => !['id', 'kind', 'occurredAt', 'source'].includes(key)) ||
      typeof event.id !== 'string' || !event.id || event.id.length > 200 || ids.has(event.id) || !EVENT_KINDS.includes(event.kind) ||
      !['manual', 'legacy-date', 'register-date'].includes(event.source) || !validEventDate(event.occurredAt) || (event.source === 'register-date' && !application.register)) fail()
    ids.add(event.id)
  }
}

// Missing legacy milestones remain unknown; current status is not historical evidence.
export function applicationEvents(application) {
  const events = Array.isArray(application.events) ? application.events : []
  const legacyDate = typeof application.appliedAt === 'string' ? application.appliedAt.slice(0, 10) : ''
  if (validEventDate(legacyDate) && !events.some((event) => event.kind === 'sent')) {
    return [...events, { id: `legacy-sent:${application.id}`, kind: 'sent', occurredAt: legacyDate, source: 'legacy-date' }]
  }
  return events
}

export function firstSendDate(application) {
  return applicationEvents(application).filter((event) => event.kind === 'sent').map((event) => event.occurredAt).sort()[0]
}

export function funnelMetrics(applications) {
  const has = (app, kind) => applicationEvents(app).some((event) => event.kind === kind)
  const sent = applications.filter((app) => has(app, 'sent'))
  const interviews = applications.filter((app) => has(app, 'interview'))
  const responses = applications.filter((app) => ['response', 'interview', 'offer', 'refusal'].some((kind) => has(app, kind)))
  return {
    sent: sent.length, interviews: interviews.length, responses: responses.length,
    offers: applications.filter((app) => has(app, 'offer')).length,
    refusals: applications.filter((app) => has(app, 'refusal')).length,
    unknownHistory: applications.filter((app) => app.eventHistoryComplete !== true).length,
    interviewRate: sent.length ? Math.round(sent.filter((app) => has(app, 'interview')).length / sent.length * 100) : null,
    responseRate: sent.length ? Math.round(sent.filter((app) => responses.includes(app)).length / sent.length * 100) : null,
  }
}
