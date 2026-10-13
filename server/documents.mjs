import { originalSnapshot, validateOriginals } from './cv-originals.mjs'
import { randomUUID } from 'node:crypto'
import { fail, exact, id } from './journey.mjs'
import { validateDocument, validateDocumentVersion } from './document-model.mjs'
import { renderDocument } from './document-export.mjs'
import { cvText } from '../shared/domain/cv-document.mjs'
export function registerDocumentRoutes(app, db, confirmWrite) {
  const get = (table, key) => { const row = db.prepare(`SELECT data FROM ${table} WHERE id = ?`).get(key); return row && JSON.parse(row.data) }
  const save = (documentId, input) => {
    if (!id(documentId) || !exact(input, ['kind', 'applicationId', 'title', 'status', 'content', 'layout', 'parentVersionId', 'sources'])) fail('Document invalide.')
    const old = get('documents', documentId), now = new Date().toISOString()
    if (old && (old.kind !== input.kind || old.applicationId !== input.applicationId)) fail('Type ou dossier du document modifié.')
    if (!old && input.applicationId !== undefined && !get('applications', input.applicationId)) fail('Dossier introuvable.')
    if (input.sources?.cvVersionId && get('document_versions', input.sources.cvVersionId)?.templateVersion !== 'single-column-cv-v1') fail('CV source introuvable.')
    if (input.kind === 'letter' && input.sources?.cvVersionId) {
      const source=get('document_versions',input.sources.cvVersionId),document=get('documents',source.documentId)
      if(document.applicationId && document.applicationId!==input.applicationId) fail('Le CV source appartient à un autre dossier.')
      if(input.sources.cvText!==cvText(source.content,source.layout)) fail('Le contenu du CV source a changé.')
    }
    if (input.parentVersionId && get('document_versions', input.parentVersionId)?.documentId !== documentId) fail('Version source introuvable.')
    const rows = db.prepare('SELECT data FROM document_versions').all().map((row) => JSON.parse(row.data))
    if (rows.length >= 10000) fail('Limite de versions atteinte.')
    const version = { id: randomUUID(), documentId, number: 1 + Math.max(0, ...rows.filter((row) => row.documentId === documentId).map((row) => row.number)), createdAt: now, title: input.title, status: input.status, content: input.content, layout: input.layout, templateVersion: input.kind === 'cv' ? 'single-column-cv-v1' : 'classic-letter-v1', sources: input.sources ?? {}, ...(input.parentVersionId ? { parentVersionId: input.parentVersionId } : {}) }
    const document = { id: documentId, kind: input.kind, ...(input.applicationId !== undefined ? { applicationId: input.applicationId } : {}), createdAt: old?.createdAt ?? now, updatedAt: now, latestVersionId: version.id }
    validateDocument(document); validateDocumentVersion(version)
    validateOriginals(originalSnapshot(db), { documentVersions: [version] })
    if (version.sources.originalId && !db.prepare('SELECT id FROM cv_originals WHERE id = ?').get(version.sources.originalId)) fail('Fichier CV source absent.')
    db.prepare('INSERT INTO document_versions VALUES (?, ?)').run(version.id, JSON.stringify(version))
    db.prepare('INSERT INTO documents VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data').run(document.id, JSON.stringify(document))
    return { document, version }
  }
  app.post('/api/documents/:id/versions', (req, res) => confirmWrite(req, res, () => save(req.params.id, req.body)))
  app.post('/api/documents/:id/clone', (req, res) => confirmWrite(req, res, () => {
    if (!exact(req.body, ['versionId', 'applicationId']) || !id(req.body.applicationId) || !id(req.body.versionId) || get('documents', req.params.id)) fail('Copie invalide.')
    const source = get('document_versions', req.body.versionId)
    if (!source || source.templateVersion !== 'single-column-cv-v1') fail('CV source introuvable.')
    return save(req.params.id, { kind: 'cv', applicationId: req.body.applicationId, title: source.title, status: 'draft', content: source.content, layout: source.layout, sources: { ...source.sources, cvVersionId: source.id } })
  }))
  app.get('/api/documents/:id/versions/:versionId/export', async (req, res, next) => {
    try {
      if (!['pdf', 'docx'].includes(req.query.format)) fail('Format invalide.')
      const version = get('document_versions', req.params.versionId)
      if (!version || version.documentId !== req.params.id) return res.status(404).json({ error: 'Version introuvable.' })
      validateDocumentVersion(version)
      const bytes = await renderDocument(version, req.query.format)
      res.set({ 'Content-Type': req.query.format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': `attachment; filename="jobpilot-${version.templateVersion === 'single-column-cv-v1' ? 'cv' : 'letter'}-v${version.number}.${req.query.format}"` }).send(bytes)
    } catch (error) { next(error) }
  })
}
