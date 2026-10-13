import { dataStore } from './data'
import type { InterviewPlan, InterviewPlanInput } from './interview-types'
import { validateInterviewPlan, interviewNotificationId } from './interviews-core.mjs'

export const INTERVIEW_STATUS_LABELS = { planned: 'Planifié', closed: 'Suivi clos', cancelled: 'Annulé' }
export const INTERVIEW_HISTORY_LABELS = { created: 'Créé', updated: 'Corrigé', rescheduled: 'Reporté', closed: 'Suivi clos', cancelled: 'Annulé', reopened: 'Rouvert' }
export const interviewInput = ({ createdAt: _created, updatedAt: _updated, history: _history, ...input }: InterviewPlan): InterviewPlanInput => input
export const interviewDateLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })
export function saveInterviewPlan(input: InterviewPlanInput) {
  return dataStore.mutate<InterviewPlan>(() => ({ method: 'PUT', path: `interview-plans/${encodeURIComponent(input.id)}`, body: input,
    apply: (state, saved) => {
      validateInterviewPlan(saved)
      if (saved.id !== input.id || saved.applicationId !== input.applicationId) throw new Error('Confirmation d’entretien invalide.')
      const previous = state.interviewPlans.find(item => item.id === saved.id)
      const reset = previous && (previous.status !== saved.status || previous.scheduledDate !== saved.scheduledDate)
      return { ...state, interviewPlans: [...state.interviewPlans.filter(item => item.id !== saved.id), saved],
        notificationReads: reset ? state.notificationReads.filter(item => item.id !== interviewNotificationId(saved.id)) : state.notificationReads }
    } }))
}
