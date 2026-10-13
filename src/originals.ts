import { dataStore } from './data'
export interface CvOriginal { id: string; name: string; format: 'pdf'|'docx'|'txt'; size: number; createdAt: string; sha256: string; text: string }
export async function uploadOriginal(file: File) {
  if (!file.size || file.size > 5 * 1024 * 1024 || !/\.(pdf|docx|txt)$/i.test(file.name)) throw new Error('Choisis un PDF, DOCX ou TXT de 5 Mio maximum.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''; for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
  const input = { id: crypto.randomUUID(), name: file.name, bytes: btoa(binary) }
  return dataStore.mutate<CvOriginal>(() => ({ method: 'POST', path: 'cv-originals', body: input, apply: (state, saved) => ({ ...state, cvOriginals: [...state.cvOriginals, saved] }) }))
}
export async function originalBytes(id: string) {
  const token = document.querySelector<HTMLMetaElement>('meta[name="jobpilot-session"]')?.content ?? ''
  const response = await fetch(`/api/cv-originals/${encodeURIComponent(id)}/bytes`, { headers: { 'X-JobPilot-Session': token }, redirect: 'error', signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error('Original indisponible. Synchronise les données.')
  return response.blob()
}
export async function downloadOriginal(value: CvOriginal) {
  const url = URL.createObjectURL(await originalBytes(value.id)), link = document.createElement('a')
  link.href = url; link.download = value.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
