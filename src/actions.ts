import { dataStore } from './data'
import type { Action, ActionInput, ActionNotification, NotificationReadState } from './action-types'
import { validateAction, validateNotificationReadState } from './actions-core.mjs'

export const KIND_LABELS: Record<ActionInput['kind'], string> = { prospect: 'Prospecter', 'prepare-application': 'Préparer une candidature', 'follow-up': 'Relancer', 'prepare-interview': 'Préparer un entretien', decide: 'Prendre une décision', other: 'Autre' }
export const PRIORITY_LABELS = { low: 'Basse', normal: 'Normale', high: 'Haute' }
export const STATUS_LABELS = { todo: 'À faire', done: 'Terminée', cancelled: 'Annulée' }
export const STAGE_LABELS = { tomorrow: 'Demain', today: 'À traiter aujourd’hui', overdue: 'En retard' }
export function saveAction(input: ActionInput) {
  return dataStore.mutate<Action>(() => ({ method: 'PUT', path: `actions/${encodeURIComponent(input.id)}`, body: input,
    apply: (state, saved) => {
      validateAction(saved)
      if (saved.id !== input.id) throw new Error('Confirmation d’action invalide.')
      const previous = state.actions.find((item) => item.id === saved.id)
      const reset = previous && (previous.status !== saved.status || previous.dueDate !== saved.dueDate)
      return { ...state, actions: [...state.actions.filter((item) => item.id !== saved.id), saved], notificationReads: reset ? state.notificationReads.filter((item) => item.id !== JSON.stringify(['action', saved.id])) : state.notificationReads }
    } }))
}
export function markNotificationsRead(items: ActionNotification[]) {
  return dataStore.mutate<NotificationReadState[]>(() => ({ method: 'POST', path: 'notifications/read', body: items.map(({ id, dueDate, stage }) => ({ id, dueDate, stage })),
    apply: (state, saved) => {
      if (!Array.isArray(saved)) throw new Error('Confirmation de lecture invalide.')
      saved.forEach(validateNotificationReadState)
      return { ...state, notificationReads: saved }
    } }))
}
