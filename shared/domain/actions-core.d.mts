import type { Action, ActionInput, ActionNotification, NotificationReadState } from '../contracts/action-types'
import type { Application } from '../contracts/types'
import type { InterviewPlan } from '../contracts/interview-types'
export const ACTION_KINDS: ActionInput['kind'][]
export const ACTION_PRIORITIES: ActionInput['priority'][]
export const ACTION_STATUSES: ActionInput['status'][]
export function validateActionInput(value: unknown): void
export function validateAction(value: unknown): void
export function validateNotificationReadState(value: unknown): void
export function parisDay(now?: Date): string
export function shiftDay(day: string, count: number): string
export function weekEnd(day: string): string
export function actionBucket(action: { dueDate?: string }, day: string): 'overdue' | 'today' | 'week' | 'later' | 'unplanned'
export function sortActions(actions: Action[]): Action[]
export function isOpenDossier(application: Application): boolean
export function sourceDeadlines(applications: Application[], actions: Action[]): { application: Application; dueDate: string; managedActionId?: string }[]
export function dossiersToDecide(applications: Application[], actions: Action[], interviewPlans?: InterviewPlan[]): Application[]
export function actionNotifications(actions: Action[], applications: Application[], reads?: NotificationReadState[], day?: string, interviewPlans?: InterviewPlan[]): ActionNotification[]
