import test from 'node:test'
import assert from 'node:assert/strict'
import { publicAddress, retrieveOffer, pageText } from '../server/offer-fetch.mjs'
import { detectOfferFields, fillEmptyOfferFields } from '../src/offer-fields.mjs'
import { journeyFixture, syntheticOffer } from './helpers/journey-fixture.mjs'
import { exportSnapshot, validateSnapshot } from '../server/snapshots.mjs'
const body=Buffer.from('<html><script>ignored</script><h1>Poste : Développeur backend</h1><p>Entreprise : Synthetic Group</p><p>CDI. Développement TypeScript et PostgreSQL. Poste à Paris. Expérience de projets logiciels.</p></html>')
const resolve=async()=>[{address:'8.8.8.8',family:4}]
const page={status:200,headers:{'content-type':'text/html'},body}
test('public address checks reject IPv4/IPv6 private, reserved and mapped destinations',async()=>{
  for(const address of ['127.0.0.1','10.0.0.1','192.168.0.1','172.31.2.3','169.254.169.254','100.64.0.1','198.18.0.1','203.0.113.1','224.0.0.1','::1','::ffff:8.8.8.8','fe80::1','fc00::1','2001:0db8::1','2001::1','2002:7f00:1::','3fff::1'])assert.equal(publicAddress(address),false,address)
  for(const address of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111','2001:4860:4860::8888'])assert.equal(publicAddress(address),true,address)
  for(const url of ['http://127.1/','http://2130706433/','http://0x7f000001/','http://[::1]/','file:///secret','https://user:pass@example.test/','http://example.test:3000/'])await assert.rejects(retrieveOffer(url,{resolve,transport:async()=>page}))
})
test('retrieval pins a validated address and revalidates every redirect and all DNS answers',async()=>{
  let calls=0
  const result=await retrieveOffer('https://example.test/start',{resolve,transport:async(url,address)=>{assert.equal(address.address,'8.8.8.8');calls++;return url.pathname==='/start'?{status:302,headers:{location:'/offer'},body:Buffer.alloc(0)}:page}})
  assert.equal(result.finalUrl,'https://example.test/offer');assert.equal(calls,2);assert.match(result.text,/Synthetic Group/);assert.doesNotMatch(result.text,/ignored|<script>/)
  await assert.rejects(retrieveOffer('https://example.test/',{resolve:async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}],transport:async()=>{throw Error('Must not dispatch')}}))
  await assert.rejects(retrieveOffer('https://example.test/',{resolve,transport:async()=>({status:302,headers:{location:'http://169.254.169.254/'},body:Buffer.alloc(0)})}))
  let resolutions=0
  await assert.rejects(retrieveOffer('https://example.test/',{resolve:async()=>[{address:++resolutions===1?'8.8.8.8':'10.0.0.1',family:4}],transport:async()=>({status:302,headers:{location:'/again'},body:Buffer.alloc(0)})}))
})
test('retrieval refuses loops, oversized/blocked/incomplete responses and expired DNS or transport',async()=>{
  for(const transport of [async()=>({...page,status:403}),async()=>({...page,body:Buffer.alloc(1024*1024+1)}),async()=>({...page,body:Buffer.from('captcha')}),async()=>({...page,body:Buffer.from('Too short')}),async()=>({status:301,headers:{location:'/loop'},body:Buffer.alloc(0)}),async()=>({...page,headers:{'content-type':'application/pdf'}})])await assert.rejects(retrieveOffer('https://example.test/',{resolve,transport}))
  await assert.rejects(retrieveOffer('https://example.test/',{resolve,timeoutMs:10,transport:()=>new Promise(done=>setTimeout(()=>done(page),40))}))
  await assert.rejects(retrieveOffer('https://example.test/',{timeoutMs:10,resolve:()=>new Promise(done=>setTimeout(()=>done([{address:'8.8.8.8',family:4}]),40)),transport:async()=>page}))
  assert.throws(()=>pageText('<input type="password">'+body.toString(),'text/html'))
})
test('local offer suggestions fill only untouched empty fields and never infer an employer from a URL',()=>{
  const text='Entreprise : Synthetic Group\nPoste : Développeur backend\nParis'
  assert.deepEqual(detectOfferFields(text),{company:'Synthetic Group',title:'Développeur backend'})
  const original={company:'Human correction',title:'',text:''},result=fillEmptyOfferFields(original,text)
  assert.equal(result.draft.company,'Human correction');assert.equal(result.draft.title,'Développeur backend');assert.equal(original.text,'')
  assert.equal(fillEmptyOfferFields({...original,company:''},text,['company']).draft.company,'')
  assert.equal(detectOfferFields('https://example.test/engineer').company,undefined)
})
test('retrieval route is authenticated, refuses local destinations and acquisition survives confirmed save and v6 export',async t=>{
  const {call,db}=await journeyFixture(t)
  assert.equal((await call('/api/offers/retrieve','POST',{url:'http://127.0.0.1/'},{'X-JobPilot-Session':''})).status,401)
  assert.equal((await call('/api/offers/retrieve','POST',{url:'http://127.0.0.1/'})).status,400)
  const acquisition={initialUrl:'https://example.test/start',finalUrl:'https://example.test/final',retrievedAt:new Date().toISOString(),text:syntheticOffer.text}
  const response=await call(`/api/offers/${syntheticOffer.id}`,'PUT',{...syntheticOffer,acquisition})
  assert.equal(response.status,200);assert.deepEqual(response.body.result.acquisition,acquisition)
  const snapshot=exportSnapshot(db,{});validateSnapshot(snapshot);assert.deepEqual(snapshot.payload.journey.offers[0].acquisition,acquisition)
  assert.throws(()=>exportSnapshot(db,{},5))
  assert.equal((await call(`/api/offers/${syntheticOffer.id}`,'PUT',{...syntheticOffer,acquisition:{...acquisition,finalUrl:'file:///secret'}})).status,400)
})
