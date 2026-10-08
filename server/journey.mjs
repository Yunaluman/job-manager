import { randomUUID } from 'node:crypto'
import { validateDocument, validateDocumentVersion, validateDocumentLinks } from './document-model.mjs'

export const JOURNEY_TABLES = { offers: 'offers', criteria: 'search_criteria', qualifications: 'qualifications', documents: 'documents', documentVersions: 'document_versions', submissions: 'submissions' }
export const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }) }
export const string = (value, max = 100000) => typeof value === 'string' && value.length <= max && !value.includes('\0')
export const id = (value) => string(value, 200) && value.length > 0 && !/[\x00-\x1f]/.test(value)
export const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every((key) => keys.includes(key))
const date = (value) => string(value, 50) && Number.isFinite(Date.parse(value))
const url = (value) => { if (value === '') return true; try { const parsed = new URL(value); return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password } catch { return false } }
export function validateCriterion(value) {
  if (!exact(value, ['id', 'label', 'importance']) || !id(value.id) || !string(value.label, 300) || !value.label.trim() || !['required', 'preferred'].includes(value.importance)) fail('Critère invalide.')
}
export function validateOfferInput(value) {
  if (!exact(value, ['id', 'company', 'title', 'text', 'url', 'note']) || !id(value.id) || !string(value.company, 300) || !value.company.trim() || !string(value.title, 300) || !value.title.trim() || !string(value.text) || !value.text.trim() || !string(value.note, 10000) || !string(value.url, 2000) || !url(value.url)) fail('Offre invalide. Vérifie l’entreprise, le poste et le contenu.')
}
export function validateOffer(value) {
  if (!value || typeof value !== 'object') fail('Offre invalide.')
  const { createdAt, updatedAt, decision, applicationId, decisions, ...input } = value; validateOfferInput(input)
  if (!date(createdAt) || !date(updatedAt) || !['pending', 'go', 'later', 'rejected'].includes(decision) || (applicationId !== undefined && !id(applicationId)) || !Array.isArray(decisions) || decisions.length > 1000 || decisions.some((entry) => !exact(entry, ['at', 'decision', 'reason']) || !date(entry.at) || !['go', 'later', 'rejected'].includes(entry.decision) || !string(entry.reason, 10000) || (entry.decision === 'rejected' && !entry.reason.trim()))) fail('Historique de décision invalide.')
}
export function validateQualification(value) {
  if (!exact(value, ['id', 'offerId', 'offerText', 'cvText', 'createdAt', 'entries', 'analysis', 'cvVersionId']) || !id(value.id) || !id(value.offerId) || !string(value.offerText) || !string(value.cvText) || !date(value.createdAt) || (value.cvVersionId !== undefined && !id(value.cvVersionId)) || !Array.isArray(value.entries) || value.entries.length > 100 || new Set(value.entries.map((entry) => entry?.criterionId)).size !== value.entries.length) fail('Qualification invalide.')
  for (const entry of value.entries) {
    if (!exact(entry, ['criterionId', 'label', 'importance', 'result', 'justification', 'provenance']) || !id(entry.criterionId) || !string(entry.label, 300) || !entry.label.trim() || !['required', 'preferred'].includes(entry.importance) || !['met', 'unmet', 'unknown'].includes(entry.result) || !string(entry.justification, 10000) || entry.provenance !== 'manual') fail('Évaluation de critère invalide.')
  }
  if (value.analysis !== undefined && (!exact(value.analysis, ['text', 'score', 'mode', 'model']) || !string(value.analysis.text) || !value.analysis.text.trim() || !(value.analysis.score === null || Number.isInteger(value.analysis.score) && value.analysis.score >= 0 && value.analysis.score <= 100) || !['manual', 'api'].includes(value.analysis.mode) || !string(value.analysis.model, 300))) fail('Analyse indicative invalide.')
}
const reserved = () => fail('Collection réservée à un lot ultérieur.')
export const JOURNEY_VALIDATORS = { offers: validateOffer, criteria: validateCriterion, qualifications: validateQualification, documents: validateDocument, documentVersions: validateDocumentVersion, submissions: reserved }
export function initializeJourney(db) { for (const table of Object.values(JOURNEY_TABLES)) db.exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, data TEXT NOT NULL)`) }
export function journeySnapshot(db) { return Object.fromEntries(Object.entries(JOURNEY_TABLES).map(([key, table]) => [key, db.prepare(`SELECT data FROM ${table} ORDER BY id`).all().map((row) => JSON.parse(row.data))])) }
export function validateJourney(value) {
  if (!exact(value, Object.keys(JOURNEY_TABLES))) fail('Parcours invalide.')
  for (const key of Object.keys(JOURNEY_TABLES)) {
    const rows = value[key]; if (!Array.isArray(rows) || rows.length > (key === 'criteria' ? 100 : 10000) || new Set(rows.map((row) => row?.id)).size !== rows.length) fail('Collection de parcours invalide.')
    rows.forEach(JOURNEY_VALIDATORS[key])
  }
  if (value.qualifications.some((item) => !value.offers.some((offer) => offer.id === item.offerId))) fail('Offre de qualification absente.')
  validateDocumentLinks(value)
}
export function restoreJourney(db, value) { validateJourney(value); initializeJourney(db); for (const [key, table] of Object.entries(JOURNEY_TABLES)) for (const row of value[key]) db.prepare(`INSERT INTO ${table} VALUES (?, ?)`).run(row.id, JSON.stringify(row)) }
export const emptyJourney = () => Object.fromEntries(Object.keys(JOURNEY_TABLES).map((key) => [key, []]))
export function registerJourneyRoutes(app, db, confirmWrite) {
  const get = (table, key) => { const row = db.prepare(`SELECT data FROM ${table} WHERE id = ?`).get(key); return row && JSON.parse(row.data) }
  const put = (table, row) => db.prepare(`INSERT INTO ${table} VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`).run(row.id, JSON.stringify(row))
  app.get('/api/offers', (_req, res) => res.json(journeySnapshot(db).offers))
  app.put('/api/criteria', (req, res) => {
    if (!Array.isArray(req.body) || req.body.length > 100 || new Set(req.body.map((item) => item?.id)).size !== req.body.length) fail('Liste de critères invalide.'); req.body.forEach(validateCriterion)
    confirmWrite(req, res, () => { db.prepare('DELETE FROM search_criteria').run(); req.body.forEach((item) => put('search_criteria', item)); return req.body })
  })
  app.put('/api/offers/:id', (req, res) => {
    validateOfferInput(req.body); if (req.body.id !== req.params.id) fail('Identifiant incohérent.')
    confirmWrite(req, res, () => { const old = get('offers', req.params.id), now = new Date().toISOString(); if (!old && journeySnapshot(db).offers.length >= 10000) fail('Limite d’offres atteinte.'); const saved = { ...req.body, createdAt: old?.createdAt ?? now, updatedAt: now, decision: old?.decision ?? 'pending', decisions: old?.decisions ?? [], ...(old?.applicationId ? { applicationId: old.applicationId } : {}) }; put('offers', saved); return saved })
  })
  app.post('/api/offers/:id/qualification', (req, res) => confirmWrite(req, res, () => {
    const offer = get('offers', req.params.id); if (!offer) fail('Offre introuvable.')
    if (!exact(req.body, ['id', 'entries', 'analysis', 'cvVersionId', 'cvText'])) fail('Qualification invalide.')
    const settings = JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'main'").get()?.value ?? '{}')
    const saved = { ...req.body, offerId: offer.id, offerText: offer.text, cvText: settings.cvText ?? '', createdAt: new Date().toISOString() }; validateQualification(saved)
    if (get('qualifications', saved.id)) fail('Cette qualification existe déjà.')
    if (journeySnapshot(db).qualifications.length >= 10000) fail('Limite de qualifications atteinte.')
    const criteria = journeySnapshot(db).criteria
    if (saved.entries.length !== criteria.length || saved.entries.some((entry) => !criteria.some((item) => item.id === entry.criterionId && item.label === entry.label && item.importance === entry.importance))) fail('Critères modifiés. Synchronise avant de qualifier.')
    if (saved.cvVersionId || req.body.cvText !== undefined) fail('Sélection de CV structuré indisponible dans ce lot.')
    put('qualifications', saved); return saved
  }))
  app.post('/api/offers/:id/decision', (req, res) => confirmWrite(req, res, () => {
    if (!exact(req.body, ['decision', 'reason']) || !['go', 'later', 'rejected'].includes(req.body.decision) || !string(req.body.reason, 10000) || (req.body.decision === 'rejected' && !req.body.reason.trim())) fail('Décision invalide : un motif est requis pour écarter.')
    const offer = get('offers', req.params.id); if (!offer) fail('Offre introuvable.')
    const now = new Date().toISOString(); let application
    if (req.body.decision === 'go' && !offer.applicationId) {
      application = { id: randomUUID(), company: offer.company, title: offer.title, url: offer.url, jobText: offer.text, status: 'a_postuler', createdAt: now, updatedAt: now, history: [{ date: now, event: 'Décision explicite de préparer la candidature' }], events: [], eventHistoryComplete: false }
      put('applications', application); offer.applicationId = application.id
    }
    if (req.body.decision === 'go' && offer.applicationId && !application) { application = get('applications', offer.applicationId); if (!application) fail('Le dossier a été supprimé. Le lien historique est conservé.') }
    const saved = { ...offer, updatedAt: now, decision: req.body.decision, decisions: [...offer.decisions, { at: now, ...req.body }] }; validateOffer(saved); put('offers', saved); return { offer: saved, application }
  }))
}
