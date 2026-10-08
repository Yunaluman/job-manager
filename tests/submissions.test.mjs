import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { journeyFixture, syntheticOffer } from './helpers/journey-fixture.mjs'
import { previewRegister,reconcileRegister } from '../server/register-csv.mjs'
import { row,csvFor } from './helpers/register-fixtures.mjs'
import { CV_SECTIONS } from '../src/cv-document.mjs'
import { nextJourneyStep,withDeclaredSends } from '../src/journey-progress.mjs'
import { funnelMetrics } from '../src/application-events.mjs'
import { journeySnapshot } from '../server/journey.mjs'
import { validateSubmissionLinks } from '../server/submissions.mjs'
import { exportSnapshot,restoreSnapshot } from '../server/snapshots.mjs'
import { createEncryptedBackup,decodeBackup } from '../server/backups.mjs'
const cv={kind:'cv',title:'CV envoyé',status:'ready',content:{name:'Fixture Équipe',title:'Développeur',contact:'fixture@example.test',summary:'Projet vérifié',experiences:[],education:[],skills:['TypeScript'],languages:[],links:[]},layout:{fontSize:11,marginMm:20,hidden:[],order:CV_SECTIONS},sources:{}}
const letter={kind:'letter',title:'Lettre envoyée',status:'ready',content:{sender:'Fixture',recipient:'Équipe',placeDate:'Paris',subject:'Candidature',greeting:'',body:'Corps vérifié',closing:'',signature:''},layout:{fontSize:11,marginMm:20,hidden:[]},sources:{}}
test('declared sends validate dossier/version/date, replay once, preserve CSV and include all data in v4/encrypted backups',async t=>{
  const {call,db,revision,directory,protector}=await journeyFixture(t),csv=csvFor([row({statut:'a_postuler',date_candidature:'',date_reponse:''})]),application=reconcileRegister(previewRegister(csv,[]),[],[{rowKey:'1',targetId:null}])[0]
  db.prepare('INSERT INTO applications VALUES (?,?)').run(application.id,JSON.stringify(application));const original=db.prepare('SELECT data FROM applications WHERE id=?').get(application.id).data
  const cvVersion=(await call('/api/documents/cv/versions','POST',{...cv,applicationId:application.id})).body.result.version
  const letterVersion=(await call('/api/documents/letter/versions','POST',{...letter,applicationId:application.id})).body.result.version
  const input={id:'declared',applicationId:application.id,occurredAt:'2026-01-05',note:'Déclaration synthétique',cvVersionId:cvVersion.id,letterVersionId:letterVersion.id}
  for(const patch of [{applicationId:'missing'},{occurredAt:'2026-02-30'},{occurredAt:'9999-01-01'},{cvVersionId:letterVersion.id},{letterVersionId:'missing'}])assert.equal((await call('/api/submissions','POST',{...input,...patch})).status,400)
  const headers={'X-JobPilot-Revision':String(revision()),'X-JobPilot-Operation':randomUUID()},first=await call('/api/submissions','POST',input,headers);assert.equal(first.status,200);assert.deepEqual((await call('/api/submissions','POST',input,headers)).body,first.body)
  assert.equal((await call('/api/submissions','POST',{...input,id:'stale'},{'X-JobPilot-Revision':headers['X-JobPilot-Revision']})).status,409)
  assert.equal(db.prepare('SELECT data FROM applications WHERE id=?').get(application.id).data,original);assert.equal((await call('/api/state')).body.actions.length,0)
  const state=journeySnapshot(db);assert.equal(nextJourneyStep(application,state,[]).label,'Décider de la prochaine action');assert.equal(funnelMetrics([withDeclaredSends(application,state.submissions)]).sent,1)
  const path=join(directory,'unified.db');restoreSnapshot(exportSnapshot(db,{}),path);const restored=new Database(path);try{assert.deepEqual(journeySnapshot(restored),state)}finally{restored.close()}
  const backup=await createEncryptedBackup(db,protector,directory),copy=new Database(decodeBackup(JSON.parse(readFileSync(backup.path,'utf8')),protector).bytes);try{assert.deepEqual(journeySnapshot(copy),state)}finally{copy.close()}
  const cancellation=await call('/api/submissions/declared/cancel','POST',{});assert.equal(cancellation.status,200);assert.equal(cancellation.body.result.occurredAt,input.occurredAt);assert.equal(funnelMetrics([withDeclaredSends(application,journeySnapshot(db).submissions)]).sent,0)
  assert.equal(db.prepare('SELECT data FROM applications WHERE id=?').get(application.id).data,original)
})
test('historical missing documents stay explicit, wrong-dossier versions refuse, failed writes roll back',async t=>{
  const {call,db,revision}=await journeyFixture(t);await call('/api/offers/offer-fixture','PUT',syntheticOffer);const application=(await call('/api/offers/offer-fixture/decision','POST',{decision:'go',reason:''})).body.result.application
  const general=(await call('/api/documents/reference/versions','POST',cv)).body.result.version
  assert.equal((await call('/api/submissions','POST',{id:'wrong',applicationId:application.id,occurredAt:'2026-01-05',cvVersionId:general.id,note:''})).status,400)
  const historical=(await call('/api/submissions','POST',{id:'historical',applicationId:application.id,occurredAt:'2026-01-05',note:'Documents inconnus'})).body.result;assert.equal(historical.cvVersionId,undefined);assert.equal(historical.letterVersionId,undefined)
  assert.throws(()=>validateSubmissionLinks({...journeySnapshot(db),submissions:[{...historical,cvVersionId:general.id}]}),/incohérent/)
  const before=revision();db.exec("CREATE TRIGGER refuse_submission BEFORE INSERT ON submissions BEGIN SELECT RAISE(ABORT,'fixture failure'); END")
  assert.equal((await call('/api/submissions','POST',{id:'failure',applicationId:application.id,occurredAt:'2026-01-06',note:''})).status,500);assert.equal(revision(),before);assert.equal(journeySnapshot(db).submissions.length,1)
  assert.deepEqual(JSON.parse(db.prepare('SELECT data FROM applications WHERE id=?').get(application.id).data).events,[])
})
test('next step distinguishes preparation from sends and avoids duplicated dated legacy evidence',()=>{
  const application={id:'a',status:'a_postuler',events:[]},journey={documents:[],documentVersions:[],submissions:[]}
  assert.equal(nextJourneyStep(application,journey,[]).label,'Préparer le CV')
  for(const kind of ['cv','letter']){journey.documents.push({id:kind,kind,applicationId:'a',latestVersionId:kind});journey.documentVersions.push({id:kind,status:'ready'})}
  assert.equal(nextJourneyStep(application,journey,[]).label,'Déclarer un envoi réalisé');assert.equal(funnelMetrics([withDeclaredSends(application,[])]).sent,0)
  journey.submissions.push({id:'s',applicationId:'a',occurredAt:'2026-01-05'});application.events.push({id:'legacy',kind:'sent',occurredAt:'2026-01-05',source:'manual'})
  assert.equal(withDeclaredSends(application,journey.submissions).events.length,1)
  assert.equal(nextJourneyStep({...application,register:{disposition:'excluded'}},journey,[]).label,'Consulter le bilan du dossier')
})
