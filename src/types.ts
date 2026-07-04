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
  a_postuler: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  postulee: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  relancee: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  entretien: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  offre: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  refusee: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
}

export interface HistoryEntry {
  date: string // ISO
  event: string
}

export interface Application {
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
