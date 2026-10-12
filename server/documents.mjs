import { randomUUID } from 'node:crypto'
import { fail, exact, id } from './journey.mjs'
import { validateDocument, validateDocumentVersion } from './document-model.mjs'
import { renderDocument } from './document-export.mjs'
export function registerDocumentRoutes(app, db, confirmWrite) {
  const get = (table, key) => { const row = db.prepare(`SELECT data FROM ${table} WHERE id = ?`).get(key); return row && JSON.parse(row.data) }
  app.post('/api/documents/:id/versions', (req, res) => confirmWrite(req, res, () => {
    const input = req.body
    if (!id(req.params.id) || !exact(input, ['kind', 'applicationId', 'title', 'status', 'content', 'layout', 'parentVersionId', 'sources'])) fail('Document invalide.')
    const old = get('documents', req.params.id), now = new Date().toISOString()
    if (old && (old.kind !== input.kind || old.applicationId !== input.applicationId)) fail('Type ou dossier du document modifié.')
    if (!old && !get('applications', input.applicationId)) fail('Dossier introuvable.')
    if (input.parentVersionId && get('document_versions', input.parentVersionId)?.documentId !== req.params.id) fail('Version source introuvable.')
    const rows = db.prepare('SELECT data FROM document_versions').all().map((row) => JSON.parse(row.data))
    if (rows.length >= 10000) fail('Limite de versions atteinte.')
    const version = { id: randomUUID(), documentId: req.params.id, number: 1 + Math.max(0, ...rows.filter((row) => row.documentId === req.params.id).map((row) => row.number)), createdAt: now, title: input.title, status: input.status, content: input.content, layout: input.layout, templateVersion: 'classic-letter-v1', sources: input.sources ?? {}, ...(input.parentVersionId ? { parentVersionId: input.parentVersionId } : {}) }
    const document = { id: req.params.id, kind: input.kind, applicationId: input.applicationId, createdAt: old?.createdAt ?? now, updatedAt: now, latestVersionId: version.id }
    validateDocument(document); validateDocumentVersion(version)
    db.prepare('INSERT INTO document_versions VALUES (?, ?)').run(version.id, JSON.stringify(version))
    db.prepare('INSERT INTO documents VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data').run(document.id, JSON.stringify(document))
    return { document, version }
  }))
  app.get('/api/documents/:id/versions/:versionId/export', async (req, res, next) => {
    try {
      if (!['pdf', 'docx'].includes(req.query.format)) fail('Format invalide.')
      const version = get('document_versions', req.params.versionId)
      if (!version || version.documentId !== req.params.id) return res.status(404).json({ error: 'Version introuvable.' })
      validateDocumentVersion(version)
      const bytes = await renderDocument(version, req.query.format)
      res.set({ 'Content-Type': req.query.format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': `attachment; filename="jobpilot-letter-v${version.number}.${req.query.format}"` }).send(bytes)
    } catch (error) { next(error) }
  })
}
