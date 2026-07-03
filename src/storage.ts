// Couche de persistance des candidatures — adossée au serveur local SQLite.
// L'UI ne voit que des hooks synchrones (cache mémoire) ; les écritures
// partent en tâche de fond via api.ts. Pour le SaaS : ne toucher qu'ici.
import { useSyncExternalStore } from 'react'
import type { Application, Status } from './types'
import { STATUS_LABELS } from './types'
import { apiGet, apiSend } from './api'

const LEGACY_KEY = 'jobpilot.applications.v1'

let cache: Application[] = []
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

// Chargement initial + migration unique depuis l'ancien localStorage
async function init() {
  try {
    let apps = await apiGet<Application[]>('applications')
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (apps.length === 0 && legacy) {
      const old = JSON.parse(legacy) as Application[]
      if (old.length > 0) {
        apiSend('PUT', 'applications', old)
        apps = old
      }
      localStorage.removeItem(LEGACY_KEY)
    }
    cache = apps.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    notify()
  } catch {
    // serveur pas encore prêt : on réessaie une fois
    setTimeout(init, 1500)
  }
}
void init()

export function useApplications(): Application[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => cache,
  )
}

export function addApplication(
  data: Omit<Application, 'id' | 'history' | 'createdAt' | 'updatedAt'>,
): Application {
  const now = new Date().toISOString()
  const app: Application = {
    ...data,
    id: crypto.randomUUID(),
    history: [{ date: now, event: `Créée — statut ${STATUS_LABELS[data.status]}` }],
    createdAt: now,
    updatedAt: now,
  }
  cache = [app, ...cache]
  notify()
  apiSend('PUT', `applications/${app.id}`, app)
  return app
}

export function updateApplication(id: string, patch: Partial<Application>) {
  const now = new Date().toISOString()
  cache = cache.map((a) => {
    if (a.id !== id) return a
    const next = { ...a, ...patch, updatedAt: now }
    if (patch.status && patch.status !== a.status) {
      next.history = [
        ...a.history,
        { date: now, event: `Statut → ${STATUS_LABELS[patch.status as Status]}` },
      ]
    }
    apiSend('PUT', `applications/${id}`, next)
    return next
  })
  notify()
}

export function deleteApplication(id: string) {
  cache = cache.filter((a) => a.id !== id)
  notify()
  apiSend('DELETE', `applications/${id}`)
}

export async function exportExcel() {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  type Row = import('write-excel-file/browser').Row
  const apps = cache
  const header: Row = [
    'Entreprise', 'Poste', 'Statut', 'Postulée le', 'Relance / prochaine action',
    'Lieu', 'Source', 'Contact', 'Salaire', 'Lien', 'Notes',
  ].map((value) => ({ value, fontWeight: 'bold' as const }))
  const rows: Row[] = apps.map((a) => [
    { value: a.company },
    { value: a.title },
    { value: STATUS_LABELS[a.status] },
    a.appliedAt ? { value: new Date(a.appliedAt), format: 'dd/mm/yyyy' } : { value: '' },
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

export function exportJSON(): string {
  return JSON.stringify(cache, null, 2)
}

export function importJSON(json: string): number {
  const data = JSON.parse(json)
  if (!Array.isArray(data)) throw new Error('Format invalide')
  cache = data as Application[]
  notify()
  apiSend('PUT', 'applications', data)
  return data.length
}

// Relances dues : prochaine action passée ou aujourd'hui, dossier encore ouvert
export function isDue(app: Application): boolean {
  if (!app.nextActionAt || app.status === 'refusee' || app.status === 'offre') return false
  return new Date(app.nextActionAt) <= new Date(new Date().toDateString())
}
