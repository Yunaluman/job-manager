import { validEventDate } from '../src/application-events.mjs'
import { parisDay } from '../src/actions-core.mjs'
const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }) }
const id = (value) => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\x00-\x1f]/.test(value)
export function validateSubmission(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key)=>!['id','applicationId','occurredAt','createdAt','cvVersionId','letterVersionId','note','source','cancelledAt'].includes(key)) || !id(value.id) || !id(value.applicationId) || !validEventDate(value.occurredAt) || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) || (value.cancelledAt!==undefined&&(typeof value.cancelledAt!=='string'||!Number.isFinite(Date.parse(value.cancelledAt)))) || value.source !== 'manual' || typeof value.note !== 'string' || value.note.length > 10000 || value.note.includes('\0') || ['cvVersionId','letterVersionId'].some((key)=>value[key] !== undefined && !id(value[key]))) fail('Envoi déclaré invalide.')
}
export function validateSubmissionLinks(journey) {
  for (const submission of journey.submissions) for (const [key,kind] of [['cvVersionId','cv'],['letterVersionId','letter']]) {
    if (!submission[key]) continue
    const version=journey.documentVersions.find(item=>item.id===submission[key]),document=version&&journey.documents.find(item=>item.id===version.documentId)
    if (!document || document.kind!==kind || document.applicationId!==submission.applicationId) fail('Document d’envoi incohérent.')
  }
}
export function registerSubmissionRoutes(app, db, confirmWrite) {
  const get=(table,key)=>{const row=db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(key);return row&&JSON.parse(row.data)}
  app.post('/api/submissions', (req,res)=>confirmWrite(req,res,()=>{
    const value=req.body
    if (!value || Object.keys(value).some(key=>!['id','applicationId','occurredAt','cvVersionId','letterVersionId','note'].includes(key))) fail('Déclaration invalide.')
    const saved={...value,createdAt:new Date().toISOString(),source:'manual'};validateSubmission(saved)
    if (!get('applications',saved.applicationId)) fail('Dossier introuvable.')
    if (get('submissions',saved.id)) fail('Déclaration déjà enregistrée.')
    if (saved.occurredAt > parisDay()) fail('Un envoi déclaré ne peut pas être futur.')
    if (db.prepare('SELECT COUNT(*) AS n FROM submissions').get().n>=10000) fail('Limite de déclarations atteinte.')
    for (const [key,kind] of [['cvVersionId','cv'],['letterVersionId','letter']]) if (saved[key]) {
      const version=get('document_versions',saved[key]),document=version&&get('documents',version.documentId)
      if (!document || document.kind!==kind || document.applicationId!==saved.applicationId) fail('Sélectionne une version de ce dossier.')
    }
    db.prepare('INSERT INTO submissions VALUES (?,?)').run(saved.id,JSON.stringify(saved));return saved
  }))
  app.post('/api/submissions/:id/cancel',(req,res)=>confirmWrite(req,res,()=>{
    if (!req.body || Array.isArray(req.body) || Object.keys(req.body).length) fail('Annulation invalide.')
    const old=get('submissions',req.params.id);if(!old)fail('Déclaration introuvable.')
    const saved={...old,cancelledAt:old.cancelledAt??new Date().toISOString()};validateSubmission(saved)
    db.prepare('UPDATE submissions SET data=? WHERE id=?').run(JSON.stringify(saved),saved.id);return saved
  }))
}
