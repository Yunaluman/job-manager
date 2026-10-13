import { createHash, randomUUID } from 'node:crypto'
import { validEventDate, applicationEvents } from '../shared/domain/application-events.mjs'

export const REGISTER_FORMAT = 'candidatures-csv-v1'
const required = ['id', 'entreprise', 'intitule_poste', 'localisation', 'source', 'url', 'date_candidature', 'statut', 'date_relance', 'date_reponse', 'resultat', 'fichier_cv', 'fichier_lm', 'notes']
const dateColumns = ['date_reperage', 'date_candidature', 'date_relance', 'date_reponse', 'date_entretien', 'date_offre', 'date_refus']
const statusMap = {
  a_preparer: ['a_postuler', 'active'], a_postuler: ['a_postuler', 'active'],
  postule: ['postulee', 'active'], postulee: ['postulee', 'active'], sans_reponse: ['postulee', 'active'],
  relance: ['relancee', 'active'], relancee: ['relancee', 'active'], entretien: ['entretien', 'active'],
  offre: ['offre', 'active'], refus: ['refusee', 'active'], refusee: ['refusee', 'active'],
  abandonne: ['a_postuler', 'archived'], ecarte: ['a_postuler', 'excluded'],
}
const sha = (value) => createHash('sha256').update(value).digest('hex')
const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }) }
const normalize = (value) => (typeof value === 'string' ? value : '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const identity = (row) => [row.company, row.title, row.location].map(normalize).join('|')

// Strict semicolon CSV: preserve quoted newlines, doubled quotes and original cell strings.
export function parseRegisterCsv(csv) {
  if (typeof csv !== 'string' || Buffer.byteLength(csv, 'utf8') > 2_000_000 || /[\u0000\ufffd]/.test(csv)) fail('CSV UTF-8 invalide ou trop volumineux (maximum 2 Mo).')
  const text = csv.replace(/^\uFEFF/, '')
  const records = []
  let row = [], cell = '', quoted = false, afterQuote = false
  const pushCell = () => { row.push(cell); cell = ''; afterQuote = false }
  const pushRow = () => { pushCell(); if (row.some((value) => value !== '')) records.push(row); row = [] }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ }
        else { quoted = false; afterQuote = true }
      } else cell += char
    } else if (char === '"') {
      if (cell || afterQuote) fail('Guillemets CSV mal placés.')
      quoted = true
    } else if (char === ';') pushCell()
    else if (char === '\n' || char === '\r') { pushRow(); if (char === '\r' && text[i + 1] === '\n') i++ }
    else { if (afterQuote) fail('Caractère après une cellule CSV fermée.'); cell += char }
    if (cell.length > 100_000 || row.length > 100 || records.length > 5000) fail('Limites du registre dépassées.')
  }
  if (quoted) fail('Cellule CSV non fermée.')
  if (cell || row.length || afterQuote) pushRow()
  const headers = records.shift()
  if (!headers || headers.length > 100 || records.length > 5000 || new Set(headers).size !== headers.length || headers.some((key) => !/^[a-z][a-z0-9_]{0,79}$/.test(key) || ['constructor', 'prototype', '__proto__'].includes(key)) || required.some((key) => !headers.includes(key))) fail('Colonnes du registre absentes, dupliquées ou invalides.')
  if (records.some((record) => record.length !== headers.length)) fail('Une ligne CSV ne contient pas le même nombre de colonnes que l’en-tête.')
  return records.map((record) => Object.fromEntries(headers.map((key, index) => [key, record[index]])))
}

function date(value) {
  if (!value?.trim()) return undefined
  const trimmed = value.trim()
  const converted = /^\d{2}\/\d{2}\/\d{4}$/.test(trimmed) ? `${trimmed.slice(6)}-${trimmed.slice(3, 5)}-${trimmed.slice(0, 2)}` : trimmed
  return validEventDate(converted) ? converted : null
}
function mapped(row) {
  const key = normalize(row.statut).replace(/ /g, '_')
  const status = Object.hasOwn(statusMap, key) ? statusMap[key] : undefined
  const errors = []
  if (!/^\d{4}-\d{3,}$/.test(row.id)) errors.push('Identifiant attendu : AAAA-NNN.')
  if (!row.entreprise.trim() || !row.intitule_poste.trim()) errors.push('Entreprise et poste requis.')
  if (!status) errors.push(`Statut non reconnu : ${row.statut}`)
  for (const column of dateColumns) if (date(row[column]) === null) errors.push(`Date invalide : ${column}.`)
  if (row.url.trim()) {
    try { const url = new URL(row.url.trim()); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) errors.push('Lien HTTP(S) sans identifiant requis.') }
    catch { errors.push('Lien invalide.') }
  }
  return { company: row.entreprise.trim(), title: row.intitule_poste.trim(), location: row.localisation.trim(),
    source: row.source.trim(), url: row.url.trim(), notes: row.notes,
    salary: row.salaire_affiche || [row.salaire_min, row.salaire_max].filter(Boolean).join(' – '),
    appliedAt: date(row.date_candidature) || undefined, nextActionAt: date(row.date_relance) || undefined,
    status: status?.[0] ?? 'a_postuler', disposition: status?.[1] ?? 'active', errors }
}

export function previewRegister(csv, applications, sourceName = 'candidatures.csv') {
  if (typeof sourceName !== 'string' || !sourceName.trim() || sourceName.length > 200 || /[\x00-\x1f]/.test(sourceName)) fail('Nom de fichier invalide.')
  const rows = parseRegisterCsv(csv)
  const fileSha256 = sha(csv)
  const ids = new Map(), identities = new Map()
  rows.forEach((row) => {
    ids.set(row.id, (ids.get(row.id) ?? 0) + 1)
    const key = identity(mapped(row)); identities.set(key, (identities.get(key) ?? 0) + 1)
  })
  return { fileSha256, sourceName, rows: rows.map((raw, index) => {
    const fields = mapped(raw), errors = [...fields.errors]
    if (ids.get(raw.id) > 1) errors.push('Identifiant dupliqué dans le fichier.')
    const external = applications.filter((app) => (app.register?.externalId ?? app.externalId ?? app.id) === raw.id)
    if (external.length > 1) errors.push('Plusieurs dossiers locaux portent cet identifiant externe.')
    if (external.some(app=>app.registerAdoptedAt)) errors.push('Dossier adopté dans JobPilot : import refusé pour préserver les corrections locales.')
    const candidates = applications.filter((app) => external.includes(app) || identity(app) === identity(fields) || (fields.url && app.url === fields.url))
      .map((app) => ({ id: app.id, company: app.company, title: app.title, location: app.location ?? '',
        externalId: app.register?.externalId ?? app.externalId, immutable: Boolean(app.register),
        reason: external.includes(app) ? 'external-id' : identity(app) === identity(fields) ? 'identity' : 'url',
        changes: Object.fromEntries(Object.entries({ ...fields, events: projectionEvents(raw, retainedEvents(app)), eventHistoryComplete: false, externalId: raw.id })
          .filter(([key, value]) => !['errors', 'disposition'].includes(key) && JSON.stringify(value ?? null) !== JSON.stringify(app[key] ?? null))
          .map(([key, value]) => [key, { before: app[key] ?? null, after: value ?? null }])) }))
    const rowSha256 = sha(JSON.stringify(raw))
    const current = external.length === 1 ? external[0] : undefined
    return { rowKey: String(index + 1), externalId: raw.id, raw, fields, errors, candidates,
      duplicateIdentity: identities.get(identity(fields)) > 1,
      unchanged: current?.register?.rowSha256 === rowSha256,
      defaultTarget: current?.id ?? null, rowSha256 }
  }), missing: applications.filter((app) => app.register?.format === REGISTER_FORMAT && !ids.has(app.register.externalId))
    .map((app) => ({ id: app.id, externalId: app.register.externalId, company: app.company, title: app.title })) }
}

function eventsFor(raw) {
  return [['date_candidature', 'sent'], ['date_reponse', 'response'], ['date_entretien', 'interview'], ['date_offre', 'offer'], ['date_refus', 'refusal']]
    .filter(([column]) => date(raw[column])).map(([column, kind]) => ({ id: `register:${raw.id}:${kind}`, kind, occurredAt: date(raw[column]), source: 'register-date' }))
}

// Preserve explicitly dated local evidence as an immutable historical archive; never infer missing CSV dates.
function retainedEvents(application) {
  return application ? application.register?.retainedEvents ?? applicationEvents(application).filter((event) => event.source !== 'register-date')
    .map((event) => ({ ...event, source: event.source ?? 'legacy-date' })) : []
}
function projectionEvents(raw, retained) {
  const fromCsv = eventsFor(raw)
  const ids = new Set(fromCsv.map((event) => event.id))
  return [...fromCsv, ...retained.filter((event) => !fromCsv.some((current) => current.kind === event.kind && current.occurredAt === event.occurredAt))
    .map((event) => ids.has(event.id) ? { ...event, id: `retained:${sha(JSON.stringify(event)).slice(0, 40)}` } : event)]
}

export function reconcileRegister(preview, applications, resolutions, now = new Date().toISOString()) {
  if (!Array.isArray(resolutions) || !resolutions.length || resolutions.length > preview.rows.length) fail('Sélection d’import vide ou invalide.')
  const chosenRows = new Set(), targets = new Set(), changes = []
  for (const resolution of resolutions) {
    if (!resolution || typeof resolution !== 'object' || Object.keys(resolution).some((key) => !['rowKey', 'targetId', 'allowDuplicate'].includes(key)) || typeof resolution.rowKey !== 'string' || chosenRows.has(resolution.rowKey) || (resolution.targetId !== null && typeof resolution.targetId !== 'string') || (resolution.allowDuplicate !== undefined && typeof resolution.allowDuplicate !== 'boolean')) fail('Rapprochement invalide ou dupliqué.')
    chosenRows.add(resolution.rowKey)
    const row = preview.rows.find((item) => item.rowKey === resolution.rowKey)
    if (!row || row.errors.length || row.unchanged) fail('Une ligne sélectionnée est invalide ou inchangée.')
    const existing = resolution.targetId === null ? undefined : applications.find((app) => app.id === resolution.targetId)
    if (resolution.targetId !== null && !existing) fail('Dossier de rapprochement introuvable.')
    if (existing && !row.candidates.some((candidate) => candidate.id === existing.id)) fail('Le dossier choisi ne correspond à aucun rapprochement proposé.')
    if (existing?.registerAdoptedAt) fail('Dossier adopté : remplacement CSV interdit.')
    if (existing?.register && existing.register.externalId !== row.externalId) fail('Un autre identifiant du registre contrôle déjà ce dossier.')
    if (row.defaultTarget && resolution.targetId !== row.defaultTarget) fail('Cet identifiant externe existe déjà : actualise son dossier.')
    if (!existing && (row.candidates.length || row.duplicateIdentity) && resolution.allowDuplicate !== true) fail('Confirme explicitement que le nouveau dossier est distinct du doublon possible.')
    const id = existing?.id ?? randomUUID()
    if (targets.has(id)) fail('Deux lignes ne peuvent pas remplacer le même dossier.')
    targets.add(id)
    const { errors: _errors, disposition, ...fields } = row.fields
    const retained = retainedEvents(existing)
    changes.push({ ...existing, id, ...fields, externalId: row.externalId, events: projectionEvents(row.raw, retained), eventHistoryComplete: false,
      createdAt: existing?.createdAt ?? now, updatedAt: now,
      history: [...(existing?.history ?? []), { date: now, event: `${existing ? 'Rapprochement' : 'Import'} du registre CSV (${row.externalId})` }],
      register: { format: REGISTER_FORMAT, externalId: row.externalId, sourceName: preview.sourceName, fileSha256: preview.fileSha256,
        rowSha256: row.rowSha256, importedAt: now, disposition, raw: row.raw, retainedEvents: retained } })
  }
  return changes
}

export function validateRegisterProjection(application) {
  if (application.register === undefined) return
  const register = application.register
  if (!register || typeof register !== 'object' || Array.isArray(register) || Object.keys(register).some((key) => !['format', 'externalId', 'sourceName', 'fileSha256', 'rowSha256', 'importedAt', 'disposition', 'raw', 'retainedEvents'].includes(key)) || register.format !== REGISTER_FORMAT || typeof register.sourceName !== 'string' || !register.sourceName.trim() || register.sourceName.length > 200 || /[\x00-\x1f]/.test(register.sourceName) || typeof register.importedAt !== 'string' || !Number.isFinite(Date.parse(register.importedAt)) || !/^[a-f0-9]{64}$/.test(register.fileSha256) || !/^[a-f0-9]{64}$/.test(register.rowSha256) || !register.raw || Array.isArray(register.raw) || required.some((key) => typeof register.raw[key] !== 'string') || Object.keys(register.raw).length > 100 || Object.entries(register.raw).some(([key, value]) => !/^[a-z][a-z0-9_]{0,79}$/.test(key) || ['constructor', 'prototype', '__proto__'].includes(key) || typeof value !== 'string' || value.length > 100000) || register.externalId !== register.raw.id || register.rowSha256 !== sha(JSON.stringify(register.raw))) fail('Provenance du registre invalide.')
  const retained = register.retainedEvents ?? []
  if (!Array.isArray(retained) || retained.length > 1000 || retained.some((event) => !event || typeof event !== 'object' || Object.keys(event).some((key) => !['id', 'kind', 'occurredAt', 'source'].includes(key)) || typeof event.id !== 'string' || !event.id || event.id.length > 200 || !['sent', 'response', 'interview', 'offer', 'refusal', 'followup'].includes(event.kind) || !['manual', 'legacy-date'].includes(event.source) || !validEventDate(event.occurredAt)) || new Set(retained.map((event) => event.id)).size !== retained.length) fail('Archive locale datée invalide.')
  const { errors, disposition, ...fields } = mapped(register.raw)
  if (application.registerAdoptedAt) {
    const sourceEvents = projectionEvents(register.raw, retained).filter(event=>event.source==='register-date')
    if (errors.length || register.disposition !== disposition || application.externalId !== register.externalId || sourceEvents.some(event=>!application.events?.some(item=>JSON.stringify(item)===JSON.stringify(event))) || application.events?.some(event=>event.source==='register-date'&&!sourceEvents.some(item=>JSON.stringify(item)===JSON.stringify(event)))) fail('Archive native invalide.')
    return
  }
  if (errors.length || register.disposition !== disposition || application.externalId !== register.externalId || Object.entries(fields).some(([key, value]) => application[key] !== value) || application.eventHistoryComplete !== false || JSON.stringify(application.events) !== JSON.stringify(projectionEvents(register.raw, retained))) fail('La projection du registre ne correspond pas à sa source.')
}
