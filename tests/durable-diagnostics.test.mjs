import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { createApp } from '../server/app.mjs'
import { createMonitoring, monitoringSnapshot, validateEvent } from '../server/ai-monitoring.mjs'
import { providerDiagnostic } from '../server/provider-errors.mjs'
import { diagnosticExplanation, validateDiagnostic } from '../shared/domain/ai-diagnostics.mjs'
import { exportSnapshot, restoreSnapshot } from '../server/snapshots.mjs'
import { journeyFixture } from './helpers/journey-fixture.mjs'
import { join } from 'node:path'

const body = {purpose:'letter-generation',prompt:'PRIVATE CV AND LETTER',model:'fixture-model',baseUrl:'https://api.mistral.ai/v1'}
test('refusal is durable across app restart, exposed in activity and backed up in v7 without private content', async t=>{
  let calls=0
  const trace='12345678-1234-1234-1234-123456789abc'
  const {db,call,directory,protector}=await journeyFixture(t,{fetchProvider:async()=>{calls++;return Response.json({code:'insufficient_permissions',message:body.prompt},{status:403,headers:{'x-request-id':trace}})}})
  await call('/api/credentials/mistral','PUT',{key:'synthetic-secret'})
  const result=await call('/api/ai','POST',body)
  assert.equal(result.status,502);assert.equal(calls,1)
  const event=(await call('/api/ai/activity')).body.events[0]
  assert.deepEqual(event.diagnostic,{version:1,kind:'provider',httpStatus:403,providerCode:'insufficient_permissions',requestId:trace})
  assert.ok(diagnosticExplanation(event.diagnostic).includes('permissions'))
  createApp({db,protector,port:5999,fetchProvider:()=>{throw new Error('Forbidden')}})
  assert.deepEqual(monitoringSnapshot(db).events[0],event)
  const snapshot=exportSnapshot(db,{})
  assert.equal(snapshot.version,7)
  for(const version of [1,2,3,4,5,6]) assert.throws(()=>exportSnapshot(db,{},version),/v7/)
  const destination=join(directory,'diagnostics.db');restoreSnapshot(snapshot,destination)
  const restored=new Database(destination)
  try{assert.deepEqual(monitoringSnapshot(restored).events,[event])}finally{restored.close()}
  for(const secret of ['synthetic-secret',body.prompt]) assert.ok(!JSON.stringify(snapshot).includes(secret))
  const invalid=structuredClone(snapshot);invalid.version=6
  invalid.checksum=createHash('sha256').update(JSON.stringify(invalid.payload)).digest('hex')
  assert.throws(()=>restoreSnapshot(invalid,join(directory,'invalid.db')),/v7/)
})
test('old failure stays unknown; restart and transport distinguish uncertain outcomes without retry', async t=>{
  let calls=0
  const {db,call}=await journeyFixture(t,{fetchProvider:async()=>{calls++;throw Object.assign(new Error(body.prompt),{name:'TimeoutError'})}})
  await call('/api/credentials/mistral','PUT',{key:'fixture-secret'})
  await call('/api/ai','POST',body)
  const event=monitoringSnapshot(db).events[0]
  assert.equal(event.diagnostic.kind,'timeout');assert.equal(event.diagnostic.httpStatus,null);assert.equal(calls,1)
  delete event.diagnostic;validateEvent(event)
  assert.equal(diagnosticExplanation(event.diagnostic),'Diagnostic non conservé')
  const monitor=createMonitoring(db);monitor.begin({purpose:'cv-analysis',provider:'mistral',model:'fixture-model'})
  const restarted=createMonitoring(db).history({}).events.find(value=>value.errorKind==='restart')
  assert.equal(restarted.diagnostic.kind,'restart');assert.equal(restarted.costNanoUsd,null)
})
test('unknown messages and secret-bearing references never enter diagnostics; closed schema rejects raw content',()=>{
  const trace='12345678-1234-1234-1234-123456789abc'
  const diagnostic=providerDiagnostic({status:403,response:{code:'PRIVATE CV',message:body.prompt},secret:trace,headers:new Headers({'x-request-id':trace})})
  assert.equal(diagnostic.providerCode,null);assert.equal(diagnostic.requestId,null)
  assert.ok(diagnosticExplanation(diagnostic).includes('motif précis n’est pas identifié'))
  for(const patch of [{message:body.prompt},{providerCode:body.prompt},{requestId:body.prompt},{httpStatus:'403'},{kind:'made-up'}]) assert.throws(()=>validateDiagnostic({...diagnostic,...patch}))
})
