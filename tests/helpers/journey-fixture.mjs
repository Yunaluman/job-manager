import Database from 'better-sqlite3'
import { createServer, request } from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../../server/app.mjs'
export const syntheticOffer = { id:'offer-fixture', company:'Fixture Équipe', title:'Développeur', text:'Développeur backend\nFixture Équipe\nCDI, Paris. Expérience TypeScript.', url:'https://example.test/offer', note:'' }
export async function journeyFixture(t, options = {}) {
  const db = new Database(':memory:'), server = createServer(), directory = mkdtempSync(join(tmpdir(),'jobpilot-journey-'))
  const protector = { protect: (value) => Buffer.from(value).toString('base64'), unprotect: (value) => Buffer.from(value,'base64').toString() } // Fixture only.
  await new Promise((done) => server.listen(0,'127.0.0.1',done))
  const result = createApp({db,port:server.address().port,protector,backupDirectory:directory,fetchProvider:options.fetchProvider ?? (()=>{throw new Error('Paid calls forbidden')})}); server.on('request',result.app)
  t.after(async()=>{server.closeAllConnections();await new Promise((done)=>server.close(done));db.close();rmSync(directory,{recursive:true,force:true})})
  const revision = ()=>db.prepare('SELECT revision FROM persistence_revision').get().revision
  const call = (path, method='GET', body, headers={})=>new Promise((done,reject)=>{
    const req=request({host:'127.0.0.1',port:server.address().port,path,method,headers:{'X-JobPilot-Session':result.token,'X-JobPilot-Revision':String(revision()),'X-JobPilot-Operation':randomUUID(),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers}},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>{const bytes=Buffer.concat(chunks);done({status:res.statusCode,body:res.headers['content-type']?.includes('application/json')?JSON.parse(bytes.toString()):bytes,headers:res.headers})})});req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body))
  })
  return {db,call,revision,directory,protector}
}
