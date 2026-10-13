export type ActionKind = 'prospect' | 'prepare-application' | 'follow-up' | 'prepare-interview' | 'decide' | 'other'
export interface ActionInput {
  id: string
  title: string
  kind: ActionKind
  dueDate?: string
  priority: 'low' | 'normal' | 'high'
  note: string
  status: 'todo' | 'done' | 'cancelled'
  resultNote: string
  applicationId?: string
  source?: { applicationId: string; dueDate: string }
  interviewPlan?: { id: string; scheduledDate: string }
}
export interface Action extends ActionInput {
  createdAt: string
  updatedAt: string
  history: { at: string; event: 'created' | 'updated' | 'rescheduled' | 'done' | 'cancelled' | 'reopened'; note: string; dueDate?: string; status: ActionInput['status'] }[]
}
export interface NotificationReadState { id: string; dueDate: string; stage: 'tomorrow' | 'today' | 'overdue'; readAt: string }
export interface ActionNotification {
  id: string; actionId?: string; applicationId?: string; title: string; dueDate: string
  stage: NotificationReadState['stage']; origin: 'action' | 'source'; unread: boolean; priority: ActionInput['priority']
}
