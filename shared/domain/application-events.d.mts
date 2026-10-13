import type { Application, ApplicationEvent } from '../contracts/types'
export const EVENT_KINDS: readonly ApplicationEvent['kind'][]
export function validEventDate(value: unknown): boolean
export function validateApplicationEvents(application: Application): void
export function applicationEvents(application: Application): ApplicationEvent[]
export function firstSendDate(application: Application): string | undefined
export function funnelMetrics(applications: Application[]): { sent: number; interviews: number; responses: number; offers: number; refusals: number; unknownHistory: number; interviewRate: number | null; responseRate: number | null }
