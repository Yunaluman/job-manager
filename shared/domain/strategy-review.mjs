import { applicationEvents, validEventDate } from './application-events.mjs'
import { withDeclaredSends } from './journey-progress.mjs'

const DAY = 86400000
const responses = new Set(['response', 'interview', 'offer', 'refusal'])
const dayNumber = (date) => Date.parse(`${date}T00:00:00Z`) / DAY
function shift(date, days) {
  const result = new Date((dayNumber(date) + days) * DAY).toISOString().slice(0, 10)
  if (!validEventDate(result)) throw new Error('Période hors des dates prises en charge.')
  return result
}

export function defaultReviewPeriod(today) {
  if (!validEventDate(today)) throw new Error('Date du jour invalide.')
  return { from: shift(today, -30), to: shift(today, -1) }
}

export function reviewPeriods(from, to, today) {
  if (![from, to, today].every(validEventDate) || from > to || to >= today) {
    throw new Error('Choisis une période valide terminée au plus tard hier.')
  }
  const days = dayNumber(to) - dayNumber(from) + 1
  return { current: { from, to }, previous: { from: shift(from, -days), to: shift(from, -1) }, days }
}

function groupValue(value) {
  const label = value?.trim().replace(/\s+/g, ' ') || ''
  return { key: label ? `value:${label.toLocaleLowerCase('fr-FR')}` : 'missing:', label: label || 'Non renseigné' }
}

function summarize(rows) {
  const matching = (kind) => rows.filter((row) => row.events.some((event) => event.kind === kind))
  const answered = rows.filter((row) => row.responseDate)
  const delays = answered.map((row) => row.responseDays).sort((a, b) => a - b)
  const middle = Math.floor(delays.length / 2)
  const medianDays = delays.length ? (delays[middle] + delays[Math.floor((delays.length - 1) / 2)]) / 2 : null
  const interviews = matching('interview')
  return {
    rows, answered, interviews, offers: matching('offer'), refusals: matching('refusal'),
    unanswered: rows.filter((row) => !row.responseDate),
    responseRate: rows.length ? answered.length / rows.length * 100 : null,
    interviewRate: rows.length ? interviews.length / rows.length * 100 : null,
    medianDays,
  }
}

function breakdown(current, previous, field) {
  const groups = new Map()
  for (const [period, rows] of [['current', current], ['previous', previous]]) {
    for (const row of rows) {
      const { key, label } = groupValue(row.application[field])
      if (!groups.has(key)) groups.set(key, { key, label, current: [], previous: [] })
      groups.get(key)[period].push(row)
    }
  }
  return [...groups.values()].map((group) => ({ ...group, current: summarize(group.current), previous: summarize(group.previous) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
}

// A dossier is assigned once, using its earliest known send, regardless of current status.
export function strategyReview(applications, submissions, from, to, today) {
  const periods = reviewPeriods(from, to, today)
  const quality = { incomplete: [], missingSend: [], missingSource: [], missingTitle: [], anomalies: [], orphanSubmissions: [] }
  const ids = new Set(applications.map((app) => app.id))
  const declarations = new Map()
  for (const submission of submissions) {
    if (submission.cancelledAt) continue
    if (!ids.has(submission.applicationId)) { quality.orphanSubmissions.push(submission); continue }
    const list = declarations.get(submission.applicationId) ?? []
    list.push(submission)
    declarations.set(submission.applicationId, list)
  }
  const cohorts = { current: [], previous: [] }
  for (const application of applications) {
    const events = applicationEvents(withDeclaredSends(application, declarations.get(application.id) ?? []))
    const dated = events.filter((event) => validEventDate(event.occurredAt) && event.occurredAt <= today)
    const sendDate = dated.filter((event) => event.kind === 'sent').map((event) => event.occurredAt).sort()[0]
    const reasons = []
    if (events.some((event) => !validEventDate(event.occurredAt))) reasons.push('Date d’étape invalide')
    if (events.some((event) => validEventDate(event.occurredAt) && event.occurredAt > today)) reasons.push('Étape datée dans le futur')
    if (sendDate && dated.some((event) => responses.has(event.kind) && event.occurredAt < sendDate)) reasons.push('Résultat antérieur au premier envoi')
    const reference = { application, sendDate, events: dated, responseDate: undefined, responseDays: undefined }
    if (application.eventHistoryComplete !== true) quality.incomplete.push(reference)
    if (!sendDate) quality.missingSend.push(reference)
    if (!application.source?.trim()) quality.missingSource.push(reference)
    if (!application.title?.trim()) quality.missingTitle.push(reference)
    if (reasons.length) quality.anomalies.push({ ...reference, reasons, events })
    if (!sendDate) continue
    for (const [name, period] of Object.entries(periods).filter(([name]) => name !== 'days')) {
      if (sendDate < period.from || sendDate > period.to) continue
      const observed = dated.filter((event) => event.occurredAt >= sendDate && event.occurredAt <= period.to)
      const responseDate = observed.filter((event) => responses.has(event.kind)).map((event) => event.occurredAt).sort()[0]
      cohorts[name].push({ ...reference, events: observed, responseDate, responseDays: responseDate ? dayNumber(responseDate) - dayNumber(sendDate) : undefined })
    }
  }
  const sortRows = (rows) => rows.sort((a, b) => a.sendDate.localeCompare(b.sendDate) || a.application.id.localeCompare(b.application.id))
  sortRows(cohorts.current); sortRows(cohorts.previous)
  return {
    periods, current: summarize(cohorts.current), previous: summarize(cohorts.previous), quality,
    sources: breakdown(cohorts.current, cohorts.previous, 'source'), titles: breakdown(cohorts.current, cohorts.previous, 'title'),
  }
}
