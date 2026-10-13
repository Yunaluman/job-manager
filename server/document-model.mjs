const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }) }
const text = (value, limit = 100000) => typeof value === 'string' && value.length <= limit && !value.includes('\0')
const id = (value) => text(value, 200) && value.length > 0 && !/[\x00-\x1f]/.test(value)
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every((key) => keys.includes(key))
const timestamp = (value) => text(value, 50) && Number.isFinite(Date.parse(value))
export const LETTER_FIELDS = ['sender', 'recipient', 'placeDate', 'subject', 'greeting', 'body', 'closing', 'signature']
export function validateLayout(value) {
  if (!exact(value, ['fontSize', 'marginMm', 'hidden']) || !Number.isInteger(value.fontSize) || value.fontSize < 10 || value.fontSize > 12 || !Number.isInteger(value.marginMm) || value.marginMm < 15 || value.marginMm > 25 || !Array.isArray(value.hidden) || value.hidden.some((key) => !LETTER_FIELDS.includes(key) || key === 'body') || new Set(value.hidden).size !== value.hidden.length) fail('Présentation invalide.')
}
export function validateLetter(value) {
  if (!exact(value, LETTER_FIELDS) || LETTER_FIELDS.some((key) => !text(value[key], key === 'body' ? 100000 : 5000)) || !value.body.trim()) fail('Lettre invalide : un corps est requis.')
}
export function validateDocument(value) {
  if (!exact(value, ['id', 'kind', 'applicationId', 'createdAt', 'updatedAt', 'latestVersionId']) || !id(value.id) || !['letter', 'cv'].includes(value.kind) || (value.applicationId !== undefined && !id(value.applicationId)) || (value.kind === 'letter' && !id(value.applicationId)) || !id(value.latestVersionId) || !timestamp(value.createdAt) || !timestamp(value.updatedAt)) fail('Document invalide.')
}
export function validateDocumentVersion(value) {
  if (!exact(value, ['id', 'documentId', 'number', 'createdAt', 'title', 'status', 'content', 'layout', 'templateVersion', 'parentVersionId', 'sources']) || !id(value.id) || !id(value.documentId) || !Number.isSafeInteger(value.number) || value.number < 1 || !timestamp(value.createdAt) || !text(value.title, 300) || !value.title.trim() || !['draft', 'ready', 'archived'].includes(value.status) || !['classic-letter-v1', 'single-column-cv-v1'].includes(value.templateVersion) || (value.parentVersionId !== undefined && !id(value.parentVersionId))) fail('Version de document invalide.')
  if (value.templateVersion === 'single-column-cv-v1') validateCv(value.content, value.layout)
  else { validateLetter(value.content); validateLayout(value.layout) }
  if (!exact(value.sources, ['prefill', 'originalId', 'offerText', 'cvText', 'legacyText', 'cvVersionId', 'generationModel', 'generationMode']) || Object.entries(value.sources).filter(([key]) => key !== 'prefill').some(([key, entry]) => ['cvVersionId','originalId'].includes(key) ? !id(entry) : key === 'generationMode' ? !['manual','api'].includes(entry) : !text(entry))) fail('Sources de document invalides.')
}
export function validateDocumentLinks(journey) {
  for (const doc of journey.documents) if (!journey.documentVersions.some((version) => version.id === doc.latestVersionId && version.documentId === doc.id)) fail('Version courante absente.')
  for (const version of journey.documentVersions) {
    if (!journey.documents.some((doc) => doc.id === version.documentId)) fail('Document de version absent.')
    if (journey.documents.find((doc) => doc.id === version.documentId).kind !== (version.templateVersion === 'single-column-cv-v1' ? 'cv' : 'letter')) fail('Type de version incohérent.')
    if (version.sources.cvVersionId && !journey.documentVersions.some((source) => source.id === version.sources.cvVersionId && source.templateVersion === 'single-column-cv-v1')) fail('CV source absent.')
    if (version.parentVersionId && !journey.documentVersions.some((parent) => parent.id === version.parentVersionId && parent.documentId === version.documentId && parent.number < version.number)) fail('Version source incohérente.')
    if (journey.documentVersions.some((other) => other.id !== version.id && other.documentId === version.documentId && other.number === version.number)) fail('Numéro de version dupliqué.')
  }
}
export function letterBlocks(version) {
  return LETTER_FIELDS.filter((key) => !version.layout.hidden.includes(key) && version.content[key].trim()).flatMap((key) => version.content[key].split('\n').map((line) => ({ text: line, bold: key === 'subject', right: key === 'recipient' || key === 'placeDate', after: key === 'body' ? 5 : 8 })))
}
import { validateCv } from '../shared/domain/cv-document.mjs'
