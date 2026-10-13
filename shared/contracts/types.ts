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



export interface HistoryEntry {
  date: string // ISO
  event: string
}

export interface ApplicationEvent {
  id: string
  kind: 'sent' | 'response' | 'interview' | 'offer' | 'refusal'
  occurredAt: string
  source: 'manual' | 'legacy-date' | 'register-date'
}

const REGISTER_STATUS_LABELS: Record<string, string> = {
  a_preparer: 'À préparer', a_postuler: 'À postuler', postule: 'Postulée', postulee: 'Postulée',
  sans_reponse: 'Sans réponse', relance: 'Relancée', relancee: 'Relancée', entretien: 'Entretien',
  offre: 'Offre', refus: 'Refus', refusee: 'Refusée', abandonne: 'Abandonnée', ecarte: 'Écartée',
}
export function applicationStatusLabel(application: Application) {
  const raw = application.register?.raw.statut
  return raw ? (Object.hasOwn(REGISTER_STATUS_LABELS, raw) ? REGISTER_STATUS_LABELS[raw] : raw) : STATUS_LABELS[application.status]
}

export interface RegisterProjection {
  format: 'candidatures-csv-v1'
  externalId: string
  sourceName: string
  fileSha256: string
  rowSha256: string
  importedAt: string
  disposition: 'active' | 'archived' | 'excluded'
  raw: Record<string, string>
  retainedEvents?: ApplicationEvent[]
}

export interface Application {
  externalId?: string
  register?: RegisterProjection
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
