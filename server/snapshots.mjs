import { hasNativeData, validatePreparation } from './register-native.mjs'
import { originalSnapshot, restoreOriginals, validateOriginals } from './cv-originals.mjs'
import { createHash } from 'node:crypto'
import { openSync, writeFileSync, fsyncSync, closeSync, unlinkSync } from 'node:fs'
import Database from 'better-sqlite3'
import { assertDatabaseIntegrity, PUBLIC_FIELDS } from './credentials.mjs'
import { monitoringSnapshot, restoreMonitoring, validateMonitoringSnapshot } from './ai-monitoring.mjs'
import { validateApplicationEvents } from '../shared/domain/application-events.mjs'
import { validateRegisterProjection } from './register-csv.mjs'
import { planningSnapshot, validatePlanning, restorePlanning } from './actions.mjs'
import { journeySnapshot, validateJourney, restoreJourney, emptyJourney } from './journey.mjs'
import { interviewSnapshot, restoreInterviews } from './interviews.mjs'
import { validateInterviewPlans } from '../shared/domain/interviews-core.mjs'

const hasV6JourneyData = journey => journey.offers.some(value=>value.acquisition !== undefined) || journey.qualifications.some(value=>value.summary !== undefined || value.proposals !== undefined || value.proposalModel !== undefined || value.entries.some(entry=>entry.provenance !== 'manual' || entry.cvEvidence !== undefined || entry.offerEvidence !== undefined)) || journey.documentVersions.some(version=>version.sources.originalId !== undefined || version.sources.prefill !== undefined)
const hasV6Monitoring = monitoring => monitoring.events.some(event=>['cv-structuring','offer-qualification'].includes(event.purpose))
const checksum = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function exportSnapshot(db, settings, version = 7) {
  assertDatabaseIntegrity(db)
  return db.transaction(() => {
    if (![1, 2, 3, 4, 5, 6, 7].includes(version)) throw new Error('Unsupported snapshot version.')
    const journey = db.prepare("SELECT name FROM sqlite_master WHERE name = 'offers'").get() ? journeySnapshot(db) : emptyJourney()
    if (version < 4 && Object.values(journey).some((rows) => rows.length)) throw new Error('Use portable v4 to preserve the application journey.')
    const planning = db.prepare("SELECT name FROM sqlite_master WHERE name = 'actions'").get() ? planningSnapshot(db) : { actions: [], notificationReads: [] }
    const interviewPlans = db.prepare("SELECT name FROM sqlite_master WHERE name = 'interview_plans'").get() ? interviewSnapshot(db) : []
    if (version < 5 && (interviewPlans.length || planning.actions.some(action => action.interviewPlan) || planning.notificationReads.some(read => read.id.startsWith('["interview",')))) throw new Error('Use portable v5 to preserve interview planning.')
    if (version < 3 && (planning.actions.length || planning.notificationReads.length)) throw new Error('Use portable v3 to preserve actions and notification read states.')
    const originals = db.prepare("SELECT name FROM sqlite_master WHERE name = 'cv_originals'").get() ? originalSnapshot(db) : []
    const monitoring = db.prepare("SELECT name FROM sqlite_master WHERE name = 'ai_events'").get() ? monitoringSnapshot(db) : {events:[]}
    if (version < 6 && (originals.length || hasV6JourneyData(journey) || hasV6Monitoring(monitoring))) throw new Error('Use portable v6 to preserve source files and reviewed qualifications.')
    if (version < 7 && (monitoring.events.some(event=>event.diagnostic !== undefined) || journey.documentVersions.some(value=>value.sources.generationProvider !== undefined))) throw new Error('Use portable v7 to preserve AI diagnostics and generation provenance.')
    if (version < 7 && hasNativeData(db.prepare('SELECT data FROM applications').all().map(row=>JSON.parse(row.data)),journey)) throw new Error('Use portable v7 for native follow-up.')
    const payload = {
      revision: db.prepare('SELECT revision FROM persistence_revision WHERE singleton = 1').get().revision,
      applications: db.prepare('SELECT data FROM applications ORDER BY id').all().map((row) => JSON.parse(row.data)),
      analyses: db.prepare('SELECT data FROM analyses ORDER BY id').all().map((row) => JSON.parse(row.data)),
      settings: Object.fromEntries(PUBLIC_FIELDS.filter((field) => typeof settings[field] === 'string').map((field) => [field, settings[field]])),
    }
    if (version >= 2) payload.monitoring = monitoring
    if (version >= 3) Object.assign(payload, planning)
    if (version >= 4) payload.journey = journey
    if (version >= 5) payload.interviewPlans = interviewPlans
    if (version >= 6) payload.cvOriginals = originals
    return { format: 'jobpilot-portable', version, exportedAt: new Date().toISOString(), checksum: checksum(payload), payload }
  })()
}

export function validateSnapshot(snapshot) {
  if (!snapshot || snapshot.format !== 'jobpilot-portable' || ![1, 2, 3, 4, 5, 6, 7].includes(snapshot.version) || !snapshot.payload || snapshot.checksum !== checksum(snapshot.payload) || Object.keys(snapshot.payload).some((key) => !['revision', 'applications', 'analyses', 'settings', ...(snapshot.version >= 2 ? ['monitoring'] : []), ...(snapshot.version >= 3 ? ['actions', 'notificationReads'] : []), ...(snapshot.version >= 4 ? ['journey'] : []), ...(snapshot.version >= 5 ? ['interviewPlans'] : []), ...(snapshot.version >= 6 ? ['cvOriginals'] : [])].includes(key))) throw new Error('Invalid snapshot or checksum.')
  const { revision, applications, analyses, settings } = snapshot.payload
  if (!Number.isSafeInteger(revision) || revision < 0 || !settings || Array.isArray(settings) || typeof settings !== 'object' || Object.entries(settings).some(([field, value]) => !PUBLIC_FIELDS.includes(field) || typeof value !== 'string' || value.length > 100000)) throw new Error('Invalid snapshot settings.')
  for (const rows of [applications, analyses]) {
    if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row) || typeof row.id !== 'string' || !row.id) || new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error('Invalid snapshot rows.')
  }
  if (snapshot.version >= 2) validateMonitoringSnapshot(snapshot.payload.monitoring)
  if (snapshot.version >= 3) validatePlanning(snapshot.payload)
  if (snapshot.version >= 4) validateJourney(snapshot.payload.journey)
  if (snapshot.version >= 5) validateInterviewPlans(snapshot.payload.interviewPlans, snapshot.payload.actions)
  else if (snapshot.payload.actions?.some(action => action.interviewPlan) || snapshot.payload.notificationReads?.some(read => read.id.startsWith('["interview",'))) throw new Error('Interview planning requires portable v5.')
  if (snapshot.version < 6 && ((snapshot.version >= 4 && hasV6JourneyData(snapshot.payload.journey)) || (snapshot.version >= 2 && hasV6Monitoring(snapshot.payload.monitoring)))) throw new Error('New source and qualification data require portable v6.')
  validateOriginals(snapshot.version >= 6 ? snapshot.payload.cvOriginals : [], snapshot.version >= 4 ? snapshot.payload.journey : emptyJourney())
  if (snapshot.version < 7 && (snapshot.payload.monitoring?.events.some(event=>event.diagnostic !== undefined) || snapshot.payload.journey?.documentVersions.some(value=>value.sources.generationProvider !== undefined))) throw new Error('AI diagnostics and generation provenance require portable v7.')
  if (snapshot.version < 7 && hasNativeData(applications,snapshot.payload.journey??emptyJourney())) throw new Error('Native follow-up requires portable v7.')
  applications.forEach(application=>validatePreparation(application,snapshot.payload.cvOriginals??[],snapshot.payload.journey??emptyJourney()))
  applications.forEach(validateApplicationEvents)
  applications.forEach(validateRegisterProjection)
  return snapshot.payload
}

// Portable restores always create a new database; credentials require separate setup.
export function restoreSnapshot(snapshot, destination) {
  const payload = validateSnapshot(snapshot)
  const db = new Database(':memory:')
  let bytes
  try {
    db.exec(`CREATE TABLE applications (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE analyses (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE persistence_revision (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), revision INTEGER NOT NULL);`)
    db.transaction(() => {
      for (const table of ['applications', 'analyses']) {
        const insert = db.prepare(`INSERT INTO ${table} VALUES (?, ?)`)
        for (const row of payload[table]) insert.run(row.id, JSON.stringify(row))
      }
      db.prepare('INSERT INTO settings VALUES (?, ?)').run('main', JSON.stringify(payload.settings))
      db.prepare('INSERT INTO persistence_revision VALUES (1, ?)').run(payload.revision)
      if (snapshot.version >= 2) restoreMonitoring(db, payload.monitoring)
      restorePlanning(db, snapshot.version >= 3 ? payload : { actions: [], notificationReads: [] })
      restoreJourney(db, snapshot.version >= 4 ? payload.journey : emptyJourney())
      restoreInterviews(db, snapshot.version >= 5 ? payload.interviewPlans : [])
      restoreOriginals(db, snapshot.version >= 6 ? payload.cvOriginals : [])
    })()
    assertDatabaseIntegrity(db)
    bytes = db.serialize()
  } finally { db.close() }
  // Exclusive creation prevents overwriting even if another process races this restore.
  const descriptor = openSync(destination, 'wx', 0o600)
  try {
    writeFileSync(descriptor, bytes)
    fsyncSync(descriptor)
  } catch (error) {
    closeSync(descriptor)
    unlinkSync(destination)
    throw error
  }
  closeSync(descriptor)
  const restored = new Database(destination, { readonly: true, fileMustExist: true })
  try {
    assertDatabaseIntegrity(restored)
    const actual = exportSnapshot(restored, JSON.parse(restored.prepare("SELECT value FROM settings WHERE key = 'main'").get().value), snapshot.version)
    if (actual.checksum !== snapshot.checksum) throw new Error('Restored data mismatch.')
  } finally { restored.close() }
  return { applications: payload.applications.length, analyses: payload.analyses.length, revision: payload.revision }
}
