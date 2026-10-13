import { createHash } from 'node:crypto'
const fail = message => { throw Object.assign(new Error(message), { status: 400 }) }
export const MAX_CV_BYTES = 5 * 1024 * 1024
export function initializeOriginals(db) { db.exec('CREATE TABLE IF NOT EXISTS cv_originals (id TEXT PRIMARY KEY, data TEXT NOT NULL)') }
export function originalSnapshot(db) { return db.prepare('SELECT data FROM cv_originals ORDER BY id').all().map(row => JSON.parse(row.data)) }
export const originalMetadata = ({ bytes, ...metadata }) => metadata
export function validateOriginal(value) {
  if (!value || Object.keys(value).some(key => !['id','name','format','size','createdAt','sha256','text','bytes'].includes(key)) || typeof value.id !== 'string' || !/^[\w-]{1,200}$/.test(value.id) || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 300 || /[\x00-\x1f\\/]/.test(value.name) || !['pdf','docx','txt'].includes(value.format) || !value.name.toLowerCase().endsWith(`.${value.format}`) || !Number.isInteger(value.size) || value.size < 1 || value.size > MAX_CV_BYTES || typeof value.bytes !== 'string' || value.bytes.length > Math.ceil(MAX_CV_BYTES / 3) * 4 || typeof value.text !== 'string' || !value.text.trim() || value.text.length > 100000 || value.text.includes('\0') || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) fail('Fichier CV invalide.')
  const bytes = Buffer.from(value.bytes, 'base64')
  if (bytes.toString('base64') !== value.bytes || bytes.length !== value.size || createHash('sha256').update(bytes).digest('hex') !== value.sha256) fail('Empreinte du fichier CV invalide.')
  if (value.format === 'pdf' && !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) fail('PDF invalide.')
  if (value.format === 'docx' && (bytes.length < 4 || bytes.readUInt16LE(0) !== 0x4b50)) fail('DOCX invalide.')
}
export function validateOriginals(values, journey) {
  if (!Array.isArray(values) || values.length > 1000 || new Set(values.map(value => value.id)).size !== values.length) fail('Bibliothèque CV invalide.')
  values.forEach(validateOriginal)
  for (const version of journey.documentVersions) if (version.sources.originalId && !values.some(value => value.id === version.sources.originalId)) fail('Fichier source du CV absent.')
}
export function restoreOriginals(db, values) { initializeOriginals(db); const insert = db.prepare('INSERT INTO cv_originals VALUES (?,?)'); values.forEach(value => insert.run(value.id, JSON.stringify(value))) }
async function extract(bytes, format) {
  if (format === 'txt') return new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim()
  if (format === 'docx') {
    let expanded = 0, entries = 0
    for (let offset = 0; offset + 46 <= bytes.length; offset++) if (bytes.readUInt32LE(offset) === 0x02014b50) { expanded += bytes.readUInt32LE(offset + 24); entries++ }
    if (!entries || expanded > 20 * 1024 * 1024 || entries > 2000) fail('DOCX trop complexe ou invalide.')
    return (await (await import('mammoth')).extractRawText({ buffer: bytes })).value.trim()
  }
  const pdf = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdf.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: false })
  try {
    const doc = await task.promise
    if (doc.numPages > 100) fail('CV trop long (100 pages maximum).')
    const pages = []
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number), content = await page.getTextContent()
      pages.push(content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim()); page.cleanup()
    }
    return pages.join('\n\n').trim()
  } finally { await task.destroy() }
}
export function registerOriginalRoutes(app, db, confirmWrite) {
  app.get('/api/cv-originals', (_req, res) => res.json(originalSnapshot(db).map(originalMetadata)))
  app.post('/api/cv-originals', async (req, res, next) => {
    try {
      const { id, name, bytes } = req.body ?? {}
      if (Object.keys(req.body ?? {}).some(key => !['id','name','bytes'].includes(key)) || typeof bytes !== 'string' || bytes.length > Math.ceil(MAX_CV_BYTES / 3) * 4 || typeof name !== 'string') fail('Fichier invalide ou supérieur à 5 Mio.')
      const buffer = Buffer.from(bytes, 'base64'), format = name.toLowerCase().split('.').pop()
      if (!['pdf','docx','txt'].includes(format) || !buffer.length || buffer.length > MAX_CV_BYTES || buffer.toString('base64') !== bytes) fail('Dépose un PDF, DOCX ou TXT valide de 5 Mio maximum.')
      let text
      try { text = await extract(buffer, format) } catch { fail('Fichier illisible ou protégé. Dépose un PDF, DOCX ou TXT valide.') }
      if (!text) fail('Aucun texte extrait. Un CV scanné nécessite un OCR externe.')
      const value = { id, name, bytes, format, size: buffer.length, text, createdAt: new Date().toISOString(), sha256: createHash('sha256').update(buffer).digest('hex') }; validateOriginal(value)
      confirmWrite(req, res, () => {
        if (db.prepare('SELECT id FROM cv_originals WHERE id = ?').get(id)) fail('Cet original existe déjà. Synchronise avant de réessayer.')
        if (db.prepare('SELECT count(*) AS count FROM cv_originals').get().count >= 1000) fail('Limite de fichiers atteinte.')
        db.prepare('INSERT INTO cv_originals VALUES (?,?)').run(id, JSON.stringify(value)); return originalMetadata(value)
      })
    } catch (error) { next(error) }
  })
  app.get('/api/cv-originals/:id/bytes', (req, res) => {
    const row = db.prepare('SELECT data FROM cv_originals WHERE id = ?').get(req.params.id)
    if (!row) return res.status(404).json({ error: 'Original absent.' })
    const value = JSON.parse(row.data)
    res.set({ 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(value.name)}` }).send(Buffer.from(value.bytes, 'base64'))
  })
}
