export type Status =
  | 'a_postuler'
  | 'postulee'
  | 'relancee'
  | 'entretien'
  | 'offre'
  | 'refusee'

export const STATUSES: Status[] = [
  'a_postuler',
  'postulee',
  'relancee',
  'entretien',
  'offre',
  'refusee',
]

export const STATUS_LABELS: Record<Status, string> = {
  a_postuler: 'À postuler',
  postulee: 'Postulée',
  relancee: 'Relancée',
  entretien: 'Entretien',
  offre: 'Offre',
  refusee: 'Refusée',
}

export const STATUS_COLORS: Record<Status, string> = {
  a_postuler: 'bg-subtle text-secondary border-line',
  postulee: 'bg-sky-500/10 text-sky-800 dark:text-sky-300 border-sky-500/30',
  relancee: 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30',
  entretien: 'bg-violet-500/10 text-violet-800 dark:text-violet-300 border-violet-500/30',
  offre: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/30',
  refusee: 'bg-rose-500/10 text-rose-800 dark:text-rose-300 border-rose-500/30',
}

export interface HistoryEntry {
  date: string // ISO
  event: string
}

export interface ApplicationEvent {
  id: string
  kind: 'sent' | 'response' | 'interview' | 'offer' | 'refusal'
  occurredAt: string
  source: 'manual' | 'legacy-date'
}

export interface Application {
  events?: ApplicationEvent[]
  eventHistoryComplete?: boolean
  id: string
  company: string
  title: string
  url?: string
  location?: string
  source?: string // LinkedIn, Indeed, site carrière...
  contact?: string
  salary?: string
  status: Status
  jobText?: string // texte de l'offre — réutilisé par l'analyse CV et la lettre
  appliedAt?: string // ISO date
  nextActionAt?: string // ISO date — date de relance / prochaine action
  notes?: string
  history: HistoryEntry[]
  createdAt: string
  updatedAt: string
}
