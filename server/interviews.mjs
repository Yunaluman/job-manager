import { validateInterviewInput, validateInterviewPlan, validateInterviewPlans, interviewNotificationId } from '../shared/domain/interviews-core.mjs'

export function initializeInterviews(db) {
  db.exec('CREATE TABLE IF NOT EXISTS interview_plans (id TEXT PRIMARY KEY, data TEXT NOT NULL);')
}
export function interviewSnapshot(db) {
  return db.prepare('SELECT data FROM interview_plans ORDER BY id').all().map(row => JSON.parse(row.data))
}
export function restoreInterviews(db, plans) {
  validateInterviewPlans(plans)
  initializeInterviews(db)
  const insert = db.prepare('INSERT INTO interview_plans VALUES (?, ?)')
  plans.forEach(plan => insert.run(plan.id, JSON.stringify(plan)))
}
export function registerInterviewRoutes(app, db, confirmWrite) {
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }) }
  app.get('/api/interview-plans', (_req, res) => res.json(interviewSnapshot(db)))
  app.put('/api/interview-plans/:id', (req, res) => {
    validateInterviewInput(req.body)
    if (req.params.id !== req.body.id) fail('Identifiant d’entretien invalide.')
    confirmWrite(req, res, () => {
      const row = db.prepare('SELECT data FROM interview_plans WHERE id = ?').get(req.body.id)
      const previous = row && JSON.parse(row.data)
      if (!previous && interviewSnapshot(db).length >= 10000) fail('Limite d’entretiens atteinte.')
      if (previous && previous.applicationId !== req.body.applicationId) fail('Le dossier lié ne peut pas être remplacé. Annule puis crée le suivi correct.')
      if (!previous && !db.prepare('SELECT id FROM applications WHERE id = ?').get(req.body.applicationId)) fail('Dossier lié introuvable.')
      const input = { ...req.body, title: req.body.title.trim(), sourceDescription: req.body.sourceDescription.trim() }
      const now = new Date().toISOString()
      const event = !previous ? 'created' : input.status !== previous.status ? (input.status === 'planned' ? 'reopened' : input.status) : input.scheduledDate !== previous.scheduledDate ? 'rescheduled' : 'updated'
      const saved = { ...input, createdAt: previous?.createdAt ?? now, updatedAt: now,
        history: [...(previous?.history ?? []), { at: now, event, values: input }] }
      validateInterviewPlan(saved)
      db.prepare('INSERT INTO interview_plans VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data').run(saved.id, JSON.stringify(saved))
      if (previous && (previous.status !== saved.status || previous.scheduledDate !== saved.scheduledDate)) {
        db.prepare('DELETE FROM notification_reads WHERE id = ?').run(interviewNotificationId(saved.id))
      }
      return saved
    })
  })
}
