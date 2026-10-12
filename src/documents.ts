import { dataStore } from './data'
import type { JobDocument, DocumentVersion, DocumentInput } from './document-types'
export const DOCUMENT_STATUS = { draft: 'Brouillon', ready: 'Prêt', archived: 'Archivé' }
export function saveDocument(id: string, input: DocumentInput) {
  return dataStore.mutate<{ document: JobDocument; version: DocumentVersion }>(() => ({ method: 'POST', path: `documents/${encodeURIComponent(id)}/versions`, body: input, apply: (state, result) => ({ ...state, journey: { ...state.journey, documents: [...state.journey.documents.filter((doc) => doc.id !== id), result.document], documentVersions: [...state.journey.documentVersions, result.version] } }) }))
}
export async function documentBytes(version: DocumentVersion, format: 'pdf' | 'docx') {
  const token = document.querySelector<HTMLMetaElement>('meta[name="jobpilot-session"]')?.content
  if (!token) throw new Error('Session locale absente.')
  const response = await fetch(`/api/documents/${encodeURIComponent(version.documentId)}/versions/${encodeURIComponent(version.id)}/export?format=${format}`, { headers: { 'X-JobPilot-Session': token }, redirect: 'error', signal: AbortSignal.timeout(60000) })
  if (!response.ok) { const error = await response.json(); throw new Error(error.error ?? 'Export impossible.') }
  return response.blob()
}
export async function downloadDocument(version: DocumentVersion, format: 'pdf' | 'docx') {
  const blob = await documentBytes(version, format), url = URL.createObjectURL(blob), link = document.createElement('a')
  link.href = url; link.download = `jobpilot-lettre-v${version.number}.${format}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
