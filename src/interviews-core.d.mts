import type { InterviewPlan } from './interview-types'
import type { Action } from './action-types'
export function validateInterviewInput(value: unknown): void
export function validateInterviewPlan(value: unknown): void
export function validateInterviewPlans(plans: unknown, actions?: Action[]): void
export function interviewNotificationId(id: string): string
