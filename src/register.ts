import type { Application } from '../shared/contracts/types'
import { apiRequest } from './api'
import { dataStore } from './data'

export interface RegisterResolution { rowKey: string; targetId: string | null; allowDuplicate?: boolean }
export interface RegisterPreviewRow {
  rowKey: string
  externalId: string
  raw: Record<string, string>
  fields: { company: string; title: string; location: string; status: string; disposition: string; appliedAt?: string; nextActionAt?: string; errors: string[] }
  errors: string[]
  candidates: { id: string; company: string; title: string; location: string; externalId?: string; immutable: boolean; reason: string; changes: Record<string, { before: unknown; after: unknown }> }[]
  duplicateIdentity: boolean
  unchanged: boolean
  defaultTarget: string | null
  rowSha256: string
}
export interface RegisterPreview {
  revision: number
  fileSha256: string
  sourceName: string
  rows: RegisterPreviewRow[]
  missing: { id: string; externalId: string; company: string; title: string }[]
}
export const previewRegister = (csv: string, sourceName: string) => apiRequest<RegisterPreview>('POST', 'register/preview', { csv, sourceName })
export async function importRegister(csv: string, sourceName: string, previewRevision: number, resolutions: RegisterResolution[]) {
  return dataStore.mutate<{ applications: Application[]; imported: number; backupVerified: boolean }>((state) => {
    if (state.revision !== previewRevision) throw new Error('Les données ont changé depuis cet aperçu. Recalcule l’aperçu avant de confirmer.')
    return { method: 'POST', path: 'register/import', body: { csv, sourceName, resolutions },
      apply: (previous, saved) => {
        if (!Array.isArray(saved.applications) || saved.backupVerified !== true || !Number.isSafeInteger(saved.imported) || saved.imported < 1) throw new Error('Confirmation d’import invalide. Synchronise les données.')
        return { ...previous, applications: saved.applications }
      } }
  })
}
