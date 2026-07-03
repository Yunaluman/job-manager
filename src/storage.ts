// Couche de persistance unique. Aujourd'hui : localStorage.
// Demain (SaaS) : remplacer ces fonctions par des appels API sans toucher à l'UI.
import { useSyncExternalStore } from 'react'
import type { Application, Status } from './types'
import { STATUS_LABELS } from './types'

const KEY = 'jobpilot.applications.v1'

let cache: Application[] | null = null
const listeners = new Set<() => void>()

function load(): Application[] {
  if (cache) return cache
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Application[]
  } catch {
    cache = []
  }
  return cache
}

function persist(apps: Application[]) {
  cache = apps
  localStorage.setItem(KEY, JSON.stringify(apps))
  listeners.forEach((l) => l())
}

export function useApplications(): Application[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    load,
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
  persist([app, ...load()])
  return app
}

export function updateApplication(id: string, patch: Partial<Application>) {
  const now = new Date().toISOString()
  persist(
    load().map((a) => {
      if (a.id !== id) return a
      const next = { ...a, ...patch, updatedAt: now }
      if (patch.status && patch.status !== a.status) {
        next.history = [
          ...a.history,
          { date: now, event: `Statut → ${STATUS_LABELS[patch.status as Status]}` },
        ]
      }
      return next
    }),
  )
}

export function deleteApplication(id: string) {
  persist(load().filter((a) => a.id !== id))
}

export async function exportExcel() {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  type Row = import('write-excel-file/browser').Row
  const apps = load()
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
  return JSON.stringify(load(), null, 2)
}

export function importJSON(json: string): number {
  const data = JSON.parse(json)
  if (!Array.isArray(data)) throw new Error('Format invalide')
  persist(data as Application[])
  return data.length
}

// Relances dues : prochaine action passée ou aujourd'hui, dossier encore ouvert
export function isDue(app: Application): boolean {
  if (!app.nextActionAt || app.status === 'refusee' || app.status === 'offre') return false
  return new Date(app.nextActionAt) <= new Date(new Date().toDateString())
}
