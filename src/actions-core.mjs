import { validEventDate } from './application-events.mjs'
import { interviewNotificationId } from './interviews-core.mjs'

export const ACTION_KINDS = ['prospect', 'prepare-application', 'follow-up', 'prepare-interview', 'decide', 'other']
export const ACTION_PRIORITIES = ['low', 'normal', 'high']
export const ACTION_STATUSES = ['todo', 'done', 'cancelled']
const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }) }
const object = (value) => value && typeof value === 'object' && !Array.isArray(value)
const text = (value, max) => typeof value === 'string' && value.length <= max && !value.includes('\u0000')
const timestamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value))
export function validateActionInput(action) {
  if (!object(action) || Object.keys(action).some((key) => !['id', 'title', 'kind', 'dueDate', 'priority', 'note', 'status', 'resultNote', 'applicationId', 'source', 'interviewPlan'].includes(key)) ||
    !text(action.id, 200) || !action.id || !text(action.title, 300) || !action.title.trim() || !ACTION_KINDS.includes(action.kind) ||
    !ACTION_PRIORITIES.includes(action.priority) || !ACTION_STATUSES.includes(action.status) || !text(action.note, 10000) || !text(action.resultNote, 10000) ||
    (action.dueDate !== undefined && !validEventDate(action.dueDate)) || (action.applicationId !== undefined && (!text(action.applicationId, 200) || !action.applicationId))) fail('Action invalide.')
  if (action.source !== undefined && (!object(action.source) || Object.keys(action.source).some((key) => !['applicationId', 'dueDate'].includes(key)) ||
    action.source.applicationId !== action.applicationId || !action.applicationId || !validEventDate(action.source.dueDate))) fail('Échéance source invalide.')
  if (action.interviewPlan !== undefined && (!object(action.interviewPlan) || Object.keys(action.interviewPlan).some(key => !['id', 'scheduledDate'].includes(key)) ||
    !text(action.interviewPlan.id, 200) || !action.interviewPlan.id || !validEventDate(action.interviewPlan.scheduledDate) ||
    !action.applicationId || action.kind !== 'prepare-interview' || action.source !== undefined)) fail('Préparation d’entretien invalide.')
}
export function validateAction(action) {
  if (!object(action)) fail('Action invalide.')
  const { createdAt, updatedAt, history, ...input } = action
  validateActionInput(input)
  if (!timestamp(createdAt) || !timestamp(updatedAt) || !Array.isArray(history) || !history.length || history.length > 10000 || history.some((entry) =>
    !object(entry) || Object.keys(entry).some((key) => !['at', 'event', 'note', 'dueDate', 'status'].includes(key)) || !timestamp(entry.at) ||
    !['created', 'updated', 'rescheduled', 'done', 'cancelled', 'reopened'].includes(entry.event) || !text(entry.note, 10000) || !ACTION_STATUSES.includes(entry.status) ||
    (entry.dueDate !== undefined && !validEventDate(entry.dueDate)))) fail('Historique d’action invalide.')
}
export function validateNotificationReadState(value) {
  if (!object(value) || Object.keys(value).some((key) => !['id', 'dueDate', 'stage', 'readAt'].includes(key)) || !text(value.id, 500) || !value.id ||
    !validEventDate(value.dueDate) || !['tomorrow', 'today', 'overdue'].includes(value.stage) || !timestamp(value.readAt)) fail('Confirmation de lecture invalide.')
}
export function parisDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const get = (type) => parts.find((part) => part.type === type).value
  return `${get('year')}-${get('month')}-${get('day')}`
}
export function shiftDay(day, count) {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + count)
  return date.toISOString().slice(0, 10)
}
export function weekEnd(day) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay()
  return shiftDay(day, (7 - weekday) % 7)
}
export function actionBucket(action, day) {
  if (!action.dueDate) return 'unplanned'
  if (action.dueDate < day) return 'overdue'
  if (action.dueDate === day) return 'today'
  return action.dueDate <= weekEnd(day) ? 'week' : 'later'
}
export function sortActions(actions) {
  const rank = { high: 0, normal: 1, low: 2 }
  return [...actions].sort((a, b) => (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31') || rank[a.priority] - rank[b.priority] || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}
export function isOpenDossier(app) {
  return app.status !== 'refusee' && (!app.register || app.register.disposition === 'active')
}
export function sourceDeadlines(applications, actions) {
  return applications.filter((app) => isOpenDossier(app) && validEventDate(app.nextActionAt)).map((app) => {
    // An open source action owns the reminder even when its source date changes.
    const managed = actions.find((action) => action.source?.applicationId === app.id && (action.status === 'todo' || action.source.dueDate === app.nextActionAt))
    return { application: app, dueDate: app.nextActionAt, managedActionId: managed?.id }
  })
}
export function dossiersToDecide(applications, actions, interviewPlans = []) {
  return applications.filter((app) => isOpenDossier(app) && !validEventDate(app.nextActionAt) && !actions.some((action) => action.status === 'todo' && action.applicationId === app.id) && !interviewPlans.some(plan => plan.applicationId === app.id && plan.status === 'planned'))
}
export function actionNotifications(actions, applications, reads = [], day = parisDay(), interviewPlans = []) {
  const stages = { tomorrow: 0, today: 1, overdue: 2 }
  const candidates = [
    ...actions.filter((action) => action.status === 'todo' && action.dueDate).map((action) => ({ id: JSON.stringify(['action', action.id]), actionId: action.id,
      applicationId: action.applicationId, title: action.title, dueDate: action.dueDate, origin: 'action', priority: action.priority })),
    ...sourceDeadlines(applications, actions).filter((source) => !source.managedActionId).map(({ application: app, dueDate }) => ({ id: JSON.stringify(['source', app.id]),
      applicationId: app.id, title: `Relance : ${app.company} — ${app.title}`, dueDate, origin: 'source', priority: 'normal' })),
    ...interviewPlans.filter(plan => plan.status === 'planned').map(plan => ({ id: interviewNotificationId(plan.id), interviewPlanId: plan.id,
      applicationId: plan.applicationId, title: `Entretien annoncé : ${plan.title}`, dueDate: plan.scheduledDate, origin: 'interview', priority: 'normal' })),
  ]
  return candidates.filter((item) => item.dueDate <= shiftDay(day, 1)).map((item) => {
    const stage = item.dueDate < day ? 'overdue' : item.dueDate === day ? 'today' : 'tomorrow'
    const read = reads.find((value) => value.id === item.id && value.dueDate === item.dueDate)
    return { ...item, stage, unread: !read || stages[read.stage] < stages[stage] }
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || ({ high: 0, normal: 1, low: 2 }[a.priority] - { high: 0, normal: 1, low: 2 }[b.priority]) || a.id.localeCompare(b.id))
}
