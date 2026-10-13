import { validateActionInput, validateAction, validateNotificationReadState, actionNotifications } from '../src/actions-core.mjs'
import { interviewSnapshot } from './interviews.mjs'

export function initializeActions(db) {
  db.exec('CREATE TABLE IF NOT EXISTS actions (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS notification_reads (id TEXT PRIMARY KEY, data TEXT NOT NULL);')
}
export function planningSnapshot(db) {
  const rows = (table) => db.prepare(`SELECT data FROM ${table} ORDER BY id`).all().map((row) => JSON.parse(row.data))
  return { actions: rows('actions'), notificationReads: rows('notification_reads') }
}
export function validatePlanning({ actions, notificationReads }) {
  for (const [rows, validate] of [[actions, validateAction], [notificationReads, validateNotificationReadState]]) {
    if (!Array.isArray(rows) || rows.length > 10000 || new Set(rows.map((row) => row?.id)).size !== rows.length) throw new Error('Invalid planning snapshot.')
    rows.forEach(validate)
  }
}
export function restorePlanning(db, planning) {
  validatePlanning(planning); initializeActions(db)
  for (const [table, rows] of [['actions', planning.actions], ['notification_reads', planning.notificationReads]]) {
    const insert = db.prepare(`INSERT INTO ${table} VALUES (?, ?)`)
    rows.forEach((row) => insert.run(row.id, JSON.stringify(row)))
  }
}
export function registerActionRoutes(app, db, confirmWrite) {
  const rows = () => planningSnapshot(db)
  const applications = () => db.prepare('SELECT data FROM applications').all().map((row) => JSON.parse(row.data))
  const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }) }
  app.get('/api/actions', (_req, res) => res.json(rows().actions))
  app.put('/api/actions/:id', (req, res) => {
    validateActionInput(req.body)
    if (req.body.id !== req.params.id) fail('Identifiant d’action invalide.')
    confirmWrite(req, res, () => {
      const previousRow = db.prepare('SELECT data FROM actions WHERE id = ?').get(req.body.id)
      const previous = previousRow && JSON.parse(previousRow.data)
      if (!previous && rows().actions.length >= 10000) fail('Limite d’actions atteinte.')
      const input = req.body
      const dossier = input.applicationId && applications().find((item) => item.id === input.applicationId)
      if (input.applicationId && !dossier && previous?.applicationId !== input.applicationId) fail('Dossier lié introuvable.')
      if (input.interviewPlan) {
        const plan = interviewSnapshot(db).find(item => item.id === input.interviewPlan.id)
        const changed = input.interviewPlan.id !== previous?.interviewPlan?.id || input.interviewPlan.scheduledDate !== previous?.interviewPlan?.scheduledDate
        if (!plan || plan.applicationId !== input.applicationId || (changed && (!dossier || plan.scheduledDate !== input.interviewPlan.scheduledDate))) fail('Entretien lié modifié ou introuvable. Synchronise avant de préparer cette action.')
        if (input.status === 'todo' && rows().actions.some(action => action.id !== input.id && action.status === 'todo' && action.interviewPlan?.id === plan.id)) fail('Une préparation est déjà ouverte pour cet entretien.')
      }
      const sourceChanged = input.source && (input.source.applicationId !== previous?.source?.applicationId || input.source.dueDate !== previous?.source?.dueDate)
      if (sourceChanged && (!dossier || dossier.nextActionAt !== input.source.dueDate)) fail('Échéance source modifiée. Synchronise avant de créer cette action.')
      if (input.source && (sourceChanged || input.status === 'todo') && rows().actions.some((action) => action.id !== input.id && action.source?.applicationId === input.source.applicationId && (action.status === 'todo' || action.source.dueDate === input.source.dueDate))) fail('Cette échéance source possède déjà une action. Modifie ou rouvre cette action.')
      const now = new Date().toISOString()
      const event = !previous ? 'created' : input.status !== previous.status ? (input.status === 'todo' ? 'reopened' : input.status) : input.dueDate !== previous.dueDate ? 'rescheduled' : 'updated'
      const saved = { ...input, title: input.title.trim(), createdAt: previous?.createdAt ?? now, updatedAt: now,
        history: [...(previous?.history ?? []), { at: now, event, note: input.status === 'todo' ? input.note : input.resultNote, status: input.status, ...(input.dueDate ? { dueDate: input.dueDate } : {}) }] }
      validateAction(saved)
      db.prepare('INSERT INTO actions VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data').run(saved.id, JSON.stringify(saved))
      if (previous && (previous.status !== saved.status || previous.dueDate !== saved.dueDate)) db.prepare('DELETE FROM notification_reads WHERE id = ?').run(JSON.stringify(['action', saved.id]))
      return saved
    })
  })
  app.get('/api/notifications', (_req, res) => {
    const planning = rows(); res.json(actionNotifications(planning.actions, applications(), planning.notificationReads))
  })
  app.post('/api/notifications/read', (req, res) => {
    if (!Array.isArray(req.body) || !req.body.length || req.body.length > 10000 || new Set(req.body.map((item) => item?.id)).size !== req.body.length) fail('Sélection de notifications invalide.')
    confirmWrite(req, res, () => {
      const planning = rows()
      const current = actionNotifications(planning.actions, applications(), planning.notificationReads)
      for (const selected of req.body) {
        if (!selected || typeof selected !== 'object' || Object.keys(selected).some((key) => !['id', 'dueDate', 'stage'].includes(key)) ||
          !current.some((item) => item.id === selected.id && item.dueDate === selected.dueDate && item.stage === selected.stage)) fail('Notification modifiée ou résolue. Actualise les alertes.')
        const value = { ...selected, readAt: new Date().toISOString() }
        validateNotificationReadState(value)
        db.prepare('INSERT INTO notification_reads VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data').run(value.id, JSON.stringify(value))
      }
      return rows().notificationReads
    })
  })
}
