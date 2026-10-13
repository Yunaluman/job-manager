import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { journeyFixture, syntheticOffer } from './helpers/journey-fixture.mjs'
import { exportSnapshot, restoreSnapshot } from '../server/snapshots.mjs'
import { journeySnapshot } from '../server/journey.mjs'
import { createEncryptedBackup, decodeBackup } from '../server/backups.mjs'
import { readFileSync } from 'node:fs'

test('manual offer writes validate links, enforce sessions/revisions and replay receipts once',async t=>{
  const {call,revision}=await journeyFixture(t)
  assert.equal((await call('/api/offers/offer-fixture','PUT',syntheticOffer,{'X-JobPilot-Session':''})).status,401)
  assert.equal((await call('/api/offers/offer-fixture','PUT',{...syntheticOffer,url:'file:///C:/private'})).status,400)
  const headers={'X-JobPilot-Revision':'0','X-JobPilot-Operation':randomUUID()}
  const first=await call('/api/offers/offer-fixture','PUT',syntheticOffer,headers);assert.equal(first.status,200)
  assert.deepEqual((await call('/api/offers/offer-fixture','PUT',syntheticOffer,headers)).body,first.body)
  assert.equal(revision(),1)
  assert.equal((await call('/api/offers/second','PUT',{...syntheticOffer,id:'second'}, {'X-JobPilot-Revision':'0'})).status,409)
})
test('qualification snapshots exact sources and unknown criteria; later decisions never fabricate sends',async t=>{
  const {call,db}=await journeyFixture(t)
  await call('/api/offers/offer-fixture','PUT',syntheticOffer)
  const criterion={id:'criterion',label:'CDI',importance:'required'};await call('/api/criteria','PUT',[criterion])
  const input={id:'qualification',entries:[{criterionId:'criterion',label:'CDI',importance:'required',result:'unknown',justification:'À vérifier',provenance:'manual'}],analysis:{text:'Note indicative : 68/100',score:68,mode:'manual',model:''}}
  assert.equal((await call('/api/offers/offer-fixture/qualification','POST',input)).status,200)
  assert.equal((await call('/api/offers/absent/qualification','POST',{...input,id:'missing'})).status,400)
  assert.equal((await call('/api/offers/offer-fixture/decision','POST',{decision:'rejected',reason:' '})).status,400)
  await call('/api/offers/offer-fixture/decision','POST',{decision:'later',reason:'Vérifier le contrat'})
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM applications').get().n,0)
  const headers={'X-JobPilot-Revision':String((await call('/api/state')).body.revision),'X-JobPilot-Operation':randomUUID()}
  const go=await call('/api/offers/offer-fixture/decision','POST',{decision:'go',reason:'Choix humain malgré inconnue'},headers)
  assert.equal(go.status,200);assert.equal(go.body.result.application.status,'a_postuler');assert.deepEqual(go.body.result.application.events,[]);assert.equal(go.body.result.application.appliedAt,undefined)
  await call('/api/offers/offer-fixture/decision','POST',{decision:'go',reason:'Choix humain malgré inconnue'},headers)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM applications').get().n,1)
  await call('/api/offers/offer-fixture','PUT',{...syntheticOffer,text:'Offre révisée'})
  const state=(await call('/api/state')).body;assert.equal(state.journey.qualifications[0].offerText,syntheticOffer.text)
  assert.equal(state.actions.length,0)
})
test('failed decisions roll back dossiers, offer history and receipt; changed criteria are refused',async t=>{
  const {call,db,revision}=await journeyFixture(t);await call('/api/offers/offer-fixture','PUT',syntheticOffer)
  const before=revision();db.exec("CREATE TRIGGER refuse_offer BEFORE UPDATE ON offers BEGIN SELECT RAISE(ABORT,'fixture failure'); END")
  assert.equal((await call('/api/offers/offer-fixture/decision','POST',{decision:'go',reason:''})).status,500)
  assert.equal(revision(),before);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM applications').get().n,0)
  await call('/api/criteria','PUT',[{id:'changed',label:'Nouveau critère',importance:'required'}])
  assert.equal((await call('/api/offers/offer-fixture/qualification','POST',{id:'old',entries:[]})).status,400)
})
test('portable v4 and encrypted snapshots preserve journey; older exports cannot omit it',async t=>{
  const {call,db,directory,protector}=await journeyFixture(t)
  for(const version of [1,2,3]) {const old=exportSnapshot(db,{},version),path=join(directory,`v${version}.db`);restoreSnapshot(old,path);const restored=new Database(path);try{assert.equal(journeySnapshot(restored).offers.length,0)}finally{restored.close()}}
  await call('/api/offers/offer-fixture','PUT',syntheticOffer)
  for(const version of [1,2,3])assert.throws(()=>exportSnapshot(db,{},version),/v4/)
  const snapshot=exportSnapshot(db,{});assert.equal(snapshot.version,5);const path=join(directory,'v5.db');restoreSnapshot(snapshot,path);const restored=new Database(path);try{assert.deepEqual(journeySnapshot(restored),journeySnapshot(db))}finally{restored.close()}
  const backup=await createEncryptedBackup(db,protector,directory),bytes=decodeBackup(JSON.parse(readFileSync(backup.path,'utf8')),protector).bytes;const encrypted=new Database(bytes);try{assert.deepEqual(journeySnapshot(encrypted),journeySnapshot(db))}finally{encrypted.close()}
})
