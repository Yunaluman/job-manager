import { validEventDate } from './application-events.mjs'

const object = (value) => value && typeof value === 'object' && !Array.isArray(value)
const text = (value, max) => typeof value === 'string' && value.length <= max && !value.includes('\u0000')
const timestamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value))
const fail = () => { throw Object.assign(new Error('Entretien planifié invalide.'), { status: 400 }) }
export function validateInterviewInput(value) {
  if (!object(value) || Object.keys(value).some(key => !['id', 'applicationId', 'title', 'scheduledDate', 'sourceDescription', 'sourceReference', 'note', 'status'].includes(key)) ||
    !text(value.id, 200) || !value.id || !text(value.applicationId, 200) || !value.applicationId ||
    !text(value.title, 300) || !value.title.trim() || !validEventDate(value.scheduledDate) ||
    !text(value.sourceDescription, 2000) || !value.sourceDescription.trim() || !text(value.sourceReference, 2000) || !text(value.note, 10000) ||
    !['planned', 'closed', 'cancelled'].includes(value.status)) fail()
}
export function validateInterviewPlan(value) {
  if (!object(value)) fail()
  const { createdAt, updatedAt, history, ...input } = value
  validateInterviewInput(input)
  if (!timestamp(createdAt) || !timestamp(updatedAt) || !Array.isArray(history) || !history.length || history.length > 10000) fail()
  for (const entry of history) {
    if (!object(entry) || Object.keys(entry).some(key => !['at', 'event', 'values'].includes(key)) || !timestamp(entry.at) ||
      !['created', 'updated', 'rescheduled', 'closed', 'cancelled', 'reopened'].includes(entry.event)) fail()
    validateInterviewInput(entry.values)
    if (entry.values.id !== input.id || entry.values.applicationId !== input.applicationId) fail()
  }
  const last = history.at(-1)
  if (Object.keys(input).some(key => input[key] !== last.values[key]) || last.at !== updatedAt || history[0].at !== createdAt || history[0].event !== 'created') fail()
}
export function validateInterviewPlans(plans, actions = []) {
  if (!Array.isArray(plans) || plans.length > 10000 || new Set(plans.map(plan => plan?.id)).size !== plans.length) fail()
  plans.forEach(validateInterviewPlan)
  const open = new Set()
  for (const action of actions) {
    if (!action.interviewPlan) continue
    const plan = plans.find(item => item.id === action.interviewPlan.id)
    if (!plan || plan.applicationId !== action.applicationId || !plan.history.some(entry => entry.values.scheduledDate === action.interviewPlan.scheduledDate)) fail()
    if (action.status === 'todo') {
      if (open.has(plan.id)) fail()
      open.add(plan.id)
    }
  }
}
export function interviewNotificationId(id) { return JSON.stringify(['interview', id]) }
