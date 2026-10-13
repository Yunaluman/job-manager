import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { qualificationSummary, validateQualificationProposals } from '../src/qualification-core.mjs'
import { journeyFixture, syntheticOffer } from './helpers/journey-fixture.mjs'
import { exportSnapshot, validateSnapshot } from '../server/snapshots.mjs'
const criteria=[{id:'contract',label:'CDI',importance:'required'},{id:'skill',label:'TypeScript',importance:'preferred'}]
const entries=(a='unknown',b='unknown')=>criteria.map((criterion,index)=>({criterionId:criterion.id,label:criterion.label,importance:criterion.importance,result:index===0?a:b,justification:'Source vérifiée',cvEvidence:'',offerEvidence:index===0?'CDI':'TypeScript',provenance:'manual'}))
const proposals=()=>[{criterionId:'contract',result:'met',justification:'Le contrat annoncé est CDI.',cvEvidence:'',offerEvidence:'CDI'},{criterionId:'skill',result:'met',justification:'Compétence documentée.',cvEvidence:'TypeScript',offerEvidence:'TypeScript'}]
test('deterministic scoring weights known criteria and never hides mandatory unknowns or contradictions',()=>{
  assert.deepEqual(qualificationSummary([]),{score:null,totalWeight:0,evaluatedWeight:0,unknownWeight:0,coverage:0,recommendation:'verify'})
  assert.equal(qualificationSummary(entries()).score,null)
  const partial=qualificationSummary(entries('unknown','met'));assert.equal(partial.score,100);assert.equal(partial.unknownWeight,2);assert.equal(partial.coverage,33);assert.equal(partial.recommendation,'verify')
  const contradiction=qualificationSummary(entries('unmet','met'));assert.equal(contradiction.score,33);assert.equal(contradiction.recommendation,'rejected')
  const preferredGap=qualificationSummary(entries('met','unmet'));assert.equal(preferredGap.score,67);assert.equal(preferredGap.recommendation,'go')
  assert.equal(qualificationSummary(entries('met','met')).score,100)
})
test('structured proposals require exact source quotes, known unique criteria and explicit evidence',()=>{
  validateQualificationProposals(proposals(),criteria,'TypeScript engineer',syntheticOffer.text)
  for(const value of [[...proposals(),proposals()[0]],[{...proposals()[0],criterionId:'missing'},proposals()[1]],[{...proposals()[0],offerEvidence:'CDD'},proposals()[1]],[{...proposals()[0],offerEvidence:''},proposals()[1]]])assert.throws(()=>validateQualificationProposals(value,criteria,'TypeScript engineer',syntheticOffer.text))
  validateQualificationProposals(proposals().map(value=>({...value,result:'unknown',cvEvidence:'',offerEvidence:''})),criteria,'',syntheticOffer.text)
})
test('explicit AI proposals use canonical sources, never create a decision, and invalid responses are refused without retry',async t=>{
  let calls=0,response={proposals:proposals()},sent
  const {call,db}=await journeyFixture(t,{fetchProvider:async(_url,options)=>{calls++;sent=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(response)}}]}),{status:200})}})
  await call('/api/credentials/mistral','PUT',{key:'synthetic-key-only'});await call('/api/settings','PUT',{cvText:'TypeScript engineer'})
  await call('/api/criteria','PUT',criteria);await call(`/api/offers/${syntheticOffer.id}`,'PUT',syntheticOffer)
  const before=db.prepare('SELECT data FROM offers').get().data
  const input={prompt:'Ignored source',purpose:'offer-qualification',offerId:syntheticOffer.id,baseUrl:'https://api.mistral.ai/v1',model:'synthetic-model',maxTokens:2000,temperature:0}
  assert.equal((await call('/api/ai','POST',input)).status,200);assert.equal(calls,1);assert.match(sent.messages[0].content,/TypeScript engineer/);assert.doesNotMatch(sent.messages[0].content,/Ignored source/)
  assert.equal(db.prepare('SELECT data FROM offers').get().data,before);assert.equal(db.prepare('SELECT count(*) AS count FROM applications').get().count,0)
  response={proposals:[{...proposals()[0],offerEvidence:'Invented'},proposals()[1]]}
  assert.equal((await call('/api/ai','POST',input)).status,502);assert.equal(calls,2)
  assert.equal((await call('/api/ai','POST',{...input,cvVersionId:'missing'})).status,400);assert.equal(calls,2)
})
test('confirmed qualification computes summary server-side, preserves proposals and refuses stale, fabricated or unproved results',async t=>{
  const {call,db,revision}=await journeyFixture(t)
  await call('/api/settings','PUT',{cvText:'TypeScript engineer'});await call('/api/criteria','PUT',criteria);await call(`/api/offers/${syntheticOffer.id}`,'PUT',syntheticOffer)
  const input={id:randomUUID(),entries:entries('met','met'),cvText:'TypeScript engineer',offerText:syntheticOffer.text,proposals:proposals(),proposalModel:'synthetic-model'}
  const headers={'X-JobPilot-Revision':String(revision()),'X-JobPilot-Operation':randomUUID()}
  const response=await call(`/api/offers/${syntheticOffer.id}/qualification`,'POST',input,headers)
  assert.equal(response.status,200);assert.equal(response.body.result.summary.score,100)
  assert.deepEqual((await call(`/api/offers/${syntheticOffer.id}/qualification`,'POST',input,headers)).body,response.body)
  assert.equal((await call(`/api/offers/${syntheticOffer.id}/qualification`,'POST',{...input,id:randomUUID()},{'X-JobPilot-Revision':'0'})).status,409)
  for(const patch of [{summary:{score:99}},{cvText:'Changed CV'},{entries:entries('met','met').map(value=>({...value,offerEvidence:'',cvEvidence:''}))},{proposalModel:'',proposals:proposals()}])assert.equal((await call(`/api/offers/${syntheticOffer.id}/qualification`,'POST',{...input,id:randomUUID(),...patch})).status,400)
  assert.equal(JSON.parse(db.prepare('SELECT data FROM offers').get().data).decision,'pending')
  const snapshot=exportSnapshot(db,{});validateSnapshot(snapshot);assert.throws(()=>exportSnapshot(db,{},5))
  snapshot.payload.journey.qualifications[0].summary.score=1;snapshot.checksum=createHash('sha256').update(JSON.stringify(snapshot.payload)).digest('hex');assert.throws(()=>validateSnapshot(snapshot))
})
