import test from 'node:test'
import assert from 'node:assert/strict'
import { localPrefill, validatePrefill } from '../src/cv-prefill.mjs'
import { journeyFixture } from './helpers/journey-fixture.mjs'
import { exportSnapshot, validateSnapshot } from '../server/snapshots.mjs'
import { createHash } from 'node:crypto'
const text = 'Nom complet : Synthetic User\nTitre professionnel : Engineer\nsynthetic@example.test\n0612345678\n75001 Paris\nTypeScript engineer'
test('local prefill only proposes explicit documented values; invented and malformed structures are rejected', () => {
  const proposals = localPrefill(text)
  assert.equal(proposals.find(item => item.field === 'name').value, 'Synthetic User')
  assert.equal(localPrefill('Anonymous developer without contact').length, 0)
  for (const values of [[{field:'name',value:'Invented User',evidence:'Synthetic User'}],[{field:'skills',value:['Rust'],evidence:'Engineer'}],[{field:'education',value:[{title:'Engineer'}],evidence:'Engineer'}],[{field:'name',value:'Synthetic User',evidence:'Absent quote'}]]) assert.throws(() => validatePrefill(values,text))
  assert.throws(() => validatePrefill([...proposals,proposals[0]],text))
})
test('structuring uses retained source and explicit provider call, validates output, and does not mutate documents', async t => {
  let response = {proposals:localPrefill(text)}, calls = 0, sent
  const {call,db} = await journeyFixture(t,{fetchProvider:async (_url, options) => {calls++;sent=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(response)}}]}),{status:200})}})
  await call('/api/credentials/mistral','PUT',{key:'synthetic-key-only'})
  assert.equal((await call('/api/cv-originals','POST',{id:'original',name:'source.txt',bytes:Buffer.from(text).toString('base64')})).status,200)
  assert.equal(calls,0)
  const request={prompt:'Ignored untrusted prompt',sourceId:'original',purpose:'cv-structuring',baseUrl:'https://api.mistral.ai/v1',model:'synthetic-model',maxTokens:2000,temperature:0}
  const good=await call('/api/ai','POST',request)
  assert.equal(good.status,200); assert.equal(calls,1); assert.match(sent.messages[0].content,/Synthetic User/); assert.doesNotMatch(sent.messages[0].content,/Ignored untrusted/)
  assert.equal(db.prepare('SELECT count(*) AS count FROM documents').get().count,0)
  response={proposals:[{field:'name',value:'Invented User',evidence:'Synthetic User'}]}
  assert.equal((await call('/api/ai','POST',request)).status,502);assert.equal(calls,2)
  assert.equal((await call('/api/ai','POST',{...request,sourceId:'missing'})).status,400);assert.equal(calls,2)
})
test('confirmed CV versions retain proposal provenance and source; tampering and missing source fail', async t => {
  const {call,db}=await journeyFixture(t)
  await call('/api/cv-originals','POST',{id:'original',name:'source.txt',bytes:Buffer.from(text).toString('base64')})
  const input={kind:'cv',title:'Synthetic CV',status:'draft',content:{name:'Synthetic User',title:'Engineer',contact:'synthetic@example.test',summary:'',experiences:[],education:[],skills:[],languages:[],links:[]},layout:{fontSize:11,marginMm:20,hidden:[],order:['identity','summary','experiences','education','skills','languages','links']},sources:{originalId:'original',cvText:text,prefill:{originalId:'original',mode:'local',model:'',proposals:localPrefill(text),appliedFields:['name']}}}
  assert.equal((await call('/api/documents/cv/versions','POST',input)).status,200)
  assert.equal((await call('/api/documents/cv/versions','POST',{...input,sources:{...input.sources,originalId:'missing'}})).status,400)
  const snapshot=exportSnapshot(db,{});validateSnapshot(snapshot)
  snapshot.payload.journey.documentVersions[0].sources.prefill.proposals[0].value='Invented User'
  snapshot.checksum=createHash('sha256').update(JSON.stringify(snapshot.payload)).digest('hex')
  assert.throws(()=>validateSnapshot(snapshot))
})
