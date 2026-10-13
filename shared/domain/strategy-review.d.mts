import type { Application, ApplicationEvent } from '../contracts/types'
import type { Submission } from '../contracts/submission-types'
export interface Period { from: string; to: string }
export interface Evidence {
  application: Application
  sendDate?: string
  events: ApplicationEvent[]
  responseDate?: string
  responseDays?: number
  reasons?: string[]
}
export interface ReviewSummary {
  rows: Evidence[]; answered: Evidence[]; interviews: Evidence[]; offers: Evidence[]; refusals: Evidence[]; unanswered: Evidence[]
  responseRate: number | null; interviewRate: number | null; medianDays: number | null
}
export interface ReviewGroup { key: string; label: string; current: ReviewSummary; previous: ReviewSummary }
export function defaultReviewPeriod(today: string): Period
export function reviewPeriods(from: string, to: string, today: string): { current: Period; previous: Period; days: number }
export function strategyReview(applications: Application[], submissions: Submission[], from: string, to: string, today: string): {
  periods: ReturnType<typeof reviewPeriods>
  current: ReviewSummary; previous: ReviewSummary
  sources: ReviewGroup[]; titles: ReviewGroup[]
  quality: { incomplete: Evidence[]; missingSend: Evidence[]; missingSource: Evidence[]; missingTitle: Evidence[]; anomalies: Evidence[]; orphanSubmissions: Submission[] }
}
