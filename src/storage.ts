// All mutations update the cache only after server confirmation.
import type { Application, Status } from './types'
import { STATUS_LABELS, applicationStatusLabel } from './types'
import { dataStore, useData } from './data'
import { apiGet } from './api'
import { applicationEvents, validEventDate, firstSendDate } from './application-events.mjs'
import type { ApplicationEvent } from './types'

export function useApplications(): Application[] { return useData().applications }

export async function addApplication(data: Omit<Application, 'id' | 'history' | 'createdAt' | 'updatedAt'>): Promise<Application> {
  const now = new Date().toISOString()
  const events = data.events ?? (validEventDate(data.appliedAt) ? [{ id: crypto.randomUUID(), kind: 'sent' as const, occurredAt: data.appliedAt!, source: 'manual' as const }] : [])
  const app: Application = { ...data, events, eventHistoryComplete: data.eventHistoryComplete ?? false, id: crypto.randomUUID(),
    history: [{ date: now, event: `Créée — statut ${STATUS_LABELS[data.status]}` }], createdAt: now, updatedAt: now }
  return dataStore.mutate<Application>(() => ({ method: 'PUT', path: `applications/${app.id}`, body: app,
    apply: (state, saved) => ({ ...state, applications: [saved, ...state.applications] }) }))
}

export async function recordApplicationEvent(id: string, kind: ApplicationEvent['kind'], occurredAt: string, eventId?: string) {
  if (!validEventDate(occurredAt)) throw new Error('Date invalide.')
  return dataStore.mutate<Application>((state) => {
    const current = state.applications.find((app) => app.id === id)
    if (!current) throw new Error('Candidature introuvable.')
    if (current.register) throw new Error('Dossier CSV en lecture seule. Modifie le registre puis réimporte son aperçu.')
    const events = applicationEvents(current)
    const old = eventId ? events.find((event) => event.id === eventId) : undefined
    if (eventId && !old) throw new Error('Étape introuvable. Synchronise les données.')
    const replacement = { id: eventId ?? crypto.randomUUID(), kind, occurredAt, source: 'manual' as const }
    const next = { ...current, updatedAt: new Date().toISOString(),
      ...(old?.kind === 'sent' ? { appliedAt: undefined } : {}),
      events: eventId ? events.map((event) => event.id === eventId ? replacement : event) : [...events, replacement],
      history: [...current.history, { date: new Date().toISOString(), event: `${eventId ? 'Étape corrigée' : 'Étape enregistrée'} : ${kind} (${occurredAt})` }] }
    return { method: 'PUT', path: `applications/${id}`, body: next,
      apply: (previous, saved) => ({ ...previous, applications: previous.applications.map((app) => app.id === id ? saved : app) }) }
  })
}

export async function removeApplicationEvent(id: string, eventId: string) {
  return dataStore.mutate<Application>((state) => {
    const current = state.applications.find((app) => app.id === id)
    if (!current) throw new Error('Candidature introuvable.')
    if (current.register) throw new Error('Dossier CSV en lecture seule. Modifie le registre puis réimporte son aperçu.')
    const events = applicationEvents(current)
    const removed = events.find((event) => event.id === eventId)
    if (!removed) throw new Error('Étape introuvable. Synchronise les données.')
    const next = { ...current, events: events.filter((event) => event.id !== eventId),
      ...(removed.kind === 'sent' ? { appliedAt: undefined } : {}), updatedAt: new Date().toISOString(),
      history: [...current.history, { date: new Date().toISOString(), event: `Étape supprimée : ${removed.kind} (${removed.occurredAt})` }] }
    return { method: 'PUT', path: `applications/${id}`, body: next,
      apply: (previous, saved) => ({ ...previous, applications: previous.applications.map((app) => app.id === id ? saved : app) }) }
  })
}

export async function updateApplication(id: string, patch: Partial<Application>) {
  return dataStore.mutate<Application>((state) => {
    const current = state.applications.find((app) => app.id === id)
    if (!current) throw new Error('Candidature introuvable. Synchronise les données.')
    if (current.register) throw new Error('Dossier CSV en lecture seule. Modifie le registre puis réimporte son aperçu.')
    const now = new Date().toISOString()
    const next = { ...current, ...patch, id: current.id, createdAt: current.createdAt, updatedAt: now }
    if (patch.status && patch.status !== current.status) {
      next.history = [...current.history, { date: now, event: `Statut → ${STATUS_LABELS[patch.status as Status]}` }]
      if (patch.status === 'relancee' && patch.nextActionAt === undefined) {
        const date = new Date()
        date.setDate(date.getDate() + 7)
        next.nextActionAt = date.toISOString().slice(0, 10)
        next.history.push({ date: now, event: 'Prochaine relance planifiée à J+7' })
      }
    }
    return { method: 'PUT', path: `applications/${id}`, body: next,
      apply: (previous, saved) => ({ ...previous, applications: previous.applications.map((app) => app.id === id ? saved : app) }) }
  })
}

export async function deleteApplication(id: string) {
  await dataStore.mutate<{ id: string }>((previous) => {
    if (previous.applications.find((app) => app.id === id)?.register) throw new Error('Dossier CSV en lecture seule. Modifie le registre puis réimporte son aperçu.')
    return { method: 'DELETE', path: `applications/${id}`,
    apply: (state, saved) => {
      if (saved.id !== id) throw new Error('Confirmation de suppression invalide.')
      return { ...state, applications: state.applications.filter((app) => app.id !== id) }
    } } })
}
export async function exportExcel() {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  type Row = import('write-excel-file/browser').Row
  const apps = dataStore.getState().applications
  const header: Row = [
    'Entreprise', 'Poste', 'Statut', 'Postulée le', 'Relance / prochaine action',
    'Lieu', 'Source', 'Contact', 'Salaire', 'Lien', 'Notes',
  ].map((value) => ({ value, fontWeight: 'bold' as const }))
  const rows: Row[] = apps.map((a) => [
    { value: a.company },
    { value: a.title },
    { value: applicationStatusLabel(a) },
    firstSendDate(a) ? { value: new Date(`${firstSendDate(a)}T12:00:00`), format: 'dd/mm/yyyy' } : { value: '' },
    a.nextActionAt ? { value: new Date(a.nextActionAt), format: 'dd/mm/yyyy' } : { value: '' },
    { value: a.location ?? '' },
    { value: a.source ?? '' },
    { value: a.contact ?? '' },
    { value: a.salary ?? '' },
    { value: a.url ?? '' },
    { value: a.notes ?? '' },
  ])
  await writeXlsxFile([header, ...rows], {
    columns: [22, 28, 12, 12, 14, 16, 14, 22, 12, 30, 40].map((width) => ({ width })),
    sheet: 'Candidatures',
  }).toFile(`candidatures-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export async function exportJSON(): Promise<string> {
  await dataStore.idle()
  return JSON.stringify(await apiGet('export'), null, 2)
}

export async function importJSON(json: string): Promise<number> {
  const data = JSON.parse(json)
  if (!Array.isArray(data)) throw new Error('Format invalide')
  const saved = await dataStore.mutate<Application[]>(() => ({ method: 'PUT', path: 'applications', body: data,
    apply: (state, applications) => ({ ...state, applications }) }))
  return saved.length
}
// Relances dues : prochaine action passée ou aujourd'hui, dossier encore ouvert
export function isDue(app: Application): boolean {
  if (app.register && app.register.disposition !== 'active') return false
  if (!app.nextActionAt || app.status === 'refusee' || app.status === 'offre') return false
  return new Date(app.nextActionAt) <= new Date(new Date().toDateString())
}
