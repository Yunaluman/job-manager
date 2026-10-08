import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import Database from 'better-sqlite3'
import mammoth from 'mammoth'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { journeyFixture, syntheticOffer } from './helpers/journey-fixture.mjs'
import { exportSnapshot, restoreSnapshot } from '../server/snapshots.mjs'
import { createEncryptedBackup, decodeBackup } from '../server/backups.mjs'
import { journeySnapshot } from '../server/journey.mjs'
export const letterInput = (applicationId) => ({kind:'letter',applicationId,title:'Lettre Équipe',status:'draft',content:{sender:'Prénom Équipe\nParis',recipient:'Secret destinataire',placeDate:'Paris, 8 octobre 2026',subject:'Candidature',greeting:'Madame, Monsieur,',body:'Élève motivé.\n• Compétences vérifiées\n• Expérience développée',closing:'Cordialement,',signature:'Prénom Équipe'},layout:{fontSize:11,marginMm:20,hidden:['recipient']},sources:{offerText:'Copie source'}})
export async function prepareApplication(call) {await call('/api/offers/offer-fixture','PUT',syntheticOffer);return (await call('/api/offers/offer-fixture/decision','POST',{decision:'go',reason:''})).body.result.application}
test('letter versions are immutable, receipts replay, stale writes reject and failed writes roll back', async t=>{
  const {call,db,revision}=await journeyFixture(t), application=await prepareApplication(call),input=letterInput(application.id)
  assert.equal((await call('/api/documents/missing/versions','POST',{...input,applicationId:'missing'})).status,400)
  const headers={'X-JobPilot-Revision':String(revision()),'X-JobPilot-Operation':randomUUID()},first=await call('/api/documents/letter/versions','POST',input,headers)
  assert.equal(first.status,200);assert.deepEqual((await call('/api/documents/letter/versions','POST',input,headers)).body,first.body)
  assert.equal((await call('/api/documents/letter/versions','POST',{...input,title:'Concurrent'}, {'X-JobPilot-Revision':headers['X-JobPilot-Revision']})).status,409)
  const second=await call('/api/documents/letter/versions','POST',{...input,status:'ready',parentVersionId:first.body.result.version.id,content:{...input.content,body:'Nouvelle version'}})
  assert.equal(second.body.result.version.number,2)
  assert.deepEqual(journeySnapshot(db).documentVersions.find(v=>v.id===first.body.result.version.id).content,input.content)
  const before=journeySnapshot(db), rev=revision();db.exec("CREATE TRIGGER refuse_document BEFORE UPDATE ON documents BEGIN SELECT RAISE(ABORT,'fixture failure'); END")
  assert.equal((await call('/api/documents/letter/versions','POST',input)).status,500);assert.equal(revision(),rev);assert.deepEqual(journeySnapshot(db),before)
})
test('authenticated PDF and Word exports preserve accents, lists and final long paragraph without changing state',async t=>{
  const {call,db,revision}=await journeyFixture(t),application=await prepareApplication(call),input=letterInput(application.id)
  input.content.body=Array.from({length:220},(_,i)=>`Paragraphe ${i} — expérience étudiée, coopération et compétences.`).join('\n')+'\nFIN INTÉGRALE'
  const saved=(await call('/api/documents/letter/versions','POST',input)).body.result, path=`/api/documents/letter/versions/${saved.version.id}/export`,before=journeySnapshot(db),rev=revision()
  assert.equal((await call(path+'?format=pdf','GET',undefined,{'X-JobPilot-Session':''})).status,401)
  assert.equal((await call(path+'?format=exe')).status,400)
  const pdf=await call(path+'?format=pdf');assert.equal(pdf.status,200)
  const task=getDocument({data:new Uint8Array(pdf.body),useSystemFonts:false}),document=await task.promise
  try{assert.ok(document.numPages>3);let text='';for(let page=1;page<=document.numPages;page++)text+=(await (await document.getPage(page)).getTextContent()).items.map(i=>i.str??'').join(' ');assert.match(text,/FIN INTÉGRALE/);assert.match(text,/expérience étudiée/);assert.doesNotMatch(text,/Secret destinataire/)}finally{await task.destroy()}
  const word=await call(path+'?format=docx'),text=(await mammoth.extractRawText({buffer:word.body})).value;assert.match(text,/FIN INTÉGRALE/);assert.doesNotMatch(text,/Secret destinataire/)
  assert.equal(revision(),rev);assert.deepEqual(journeySnapshot(db),before);assert.deepEqual((await call('/api/state')).body.applications[0].events,[])
})
test('v4 and encrypted backups retain all versions; historical dossier links survive deletion',async t=>{
  const {call,db,directory,protector}=await journeyFixture(t),application=await prepareApplication(call),input=letterInput(application.id)
  await call('/api/documents/letter/versions','POST',input)
  db.prepare('DELETE FROM applications WHERE id = ?').run(application.id)
  assert.equal((await call('/api/documents/letter/versions','POST',input)).status,200)
  const snapshot=exportSnapshot(db,{}),path=join(directory,'documents.db');restoreSnapshot(snapshot,path);const restored=new Database(path);try{assert.deepEqual(journeySnapshot(restored),journeySnapshot(db))}finally{restored.close()}
  const backup=await createEncryptedBackup(db,protector,directory),copy=new Database(decodeBackup(JSON.parse(readFileSync(backup.path,'utf8')),protector).bytes);try{assert.deepEqual(journeySnapshot(copy),journeySnapshot(db))}finally{copy.close()}
  for(const version of [1,2,3])assert.throws(()=>exportSnapshot(db,{},version),/v4/)
})
