import test from 'node:test'
import assert from 'node:assert/strict'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import mammoth from 'mammoth'
import { journeyFixture, syntheticOffer } from './helpers/journey-fixture.mjs'
import { cvText, CV_SECTIONS } from '../src/cv-document.mjs'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { exportSnapshot, restoreSnapshot } from '../server/snapshots.mjs'
import { journeySnapshot } from '../server/journey.mjs'
const input = {kind:'cv',title:'CV de référence',status:'ready',content:{name:'Prénom Équipe',contact:'fixture@example.test',title:'Développeur',summary:'Présentation vérifiée',experiences:[{title:'Développeur backend',organization:'Fixture',period:'2025–2026',description:'• TypeScript\n• Tests déterministes'}],education:[{title:'Master',organization:'École',period:'2026',description:'Projet vérifié'}],skills:['TypeScript','SQL'],languages:['Français'],links:['https://example.test']},layout:{fontSize:11,marginMm:20,hidden:['links'],order:CV_SECTIONS},sources:{cvText:'Texte importé à vérifier'}}
test('CV clones a precise immutable version; later profile edits never propagate and qualification snapshots selected sources',async t=>{
  const {call,db,directory}=await journeyFixture(t)
  const source=(await call('/api/documents/reference/versions','POST',input)).body.result.version
  await call('/api/offers/offer-fixture','PUT',syntheticOffer);const application=(await call('/api/offers/offer-fixture/decision','POST',{decision:'go',reason:''})).body.result.application
  const clone=await call('/api/documents/variant/clone','POST',{versionId:source.id,applicationId:application.id});assert.equal(clone.status,200);assert.deepEqual(clone.body.result.version.content,source.content)
  await call('/api/documents/reference/versions','POST',{...input,parentVersionId:source.id,content:{...input.content,title:'Profil révisé'}})
  const variant=(await call('/api/state')).body.journey.documentVersions.find(v=>v.id===clone.body.result.version.id);assert.equal(variant.content.title,'Développeur');assert.equal(variant.status,'draft');assert.equal(variant.sources.cvVersionId,source.id)
  const qualification={id:'qualified',entries:[],cvVersionId:variant.id,cvText:cvText(variant.content,variant.layout),offerText:syntheticOffer.text}
  assert.equal((await call('/api/offers/offer-fixture/qualification','POST',{...qualification,cvText:'Fausse source'})).status,400)
  assert.equal((await call('/api/offers/offer-fixture/qualification','POST',qualification)).status,200)
  const saved=(await call('/api/state')).body.journey.qualifications[0];assert.equal(saved.cvVersionId,variant.id);assert.equal(saved.cvText,qualification.cvText);assert.doesNotMatch(saved.cvText,/https/)
  await call('/api/offers/offer-fixture','PUT',{...syntheticOffer,text:'Offre changée'})
  assert.equal((await call('/api/offers/offer-fixture/qualification','POST',{...qualification,id:'stale'})).status,400)
  assert.deepEqual(JSON.parse(db.prepare('SELECT data FROM applications WHERE id=?').get(application.id).data).events,[])
  assert.equal((await call('/api/documents/other/clone','POST',{versionId:source.id,applicationId:'missing'})).status,400)
  const path=join(directory,'cv-restored.db');restoreSnapshot(exportSnapshot(db,{}),path);const restored=new Database(path);try{assert.deepEqual(journeySnapshot(restored),journeySnapshot(db))}finally{restored.close()}
  const analysis={id:'exact-analysis',date:new Date().toISOString(),jobTitle:'Fixture',result:'Note indicative : 60/100',score:60,mode:'manuel',applicationId:application.id,cvVersionId:variant.id,cvText:qualification.cvText,offerText:syntheticOffer.text}
  assert.equal((await call('/api/analyses/exact-analysis','PUT',{...analysis,cvText:'Fausse source'})).status,400)
  assert.equal((await call('/api/analyses/exact-analysis','PUT',analysis)).status,200)
})
test('CV exports ordered visible sections, repeatable entries and long final content in Word/PDF',async t=>{
  const {call}=await journeyFixture(t),long={...input,content:{...input.content,experiences:Array.from({length:70},(_,i)=>({title:`Expérience ${i}`,organization:'Équipe',period:'2026',description:'Développement et coopération\nCOMPÉTENCE VÉRIFIÉE'}))},layout:{...input.layout,order:['identity','skills','summary','experiences','education','languages','links']}}
  const result=await call('/api/documents/reference/versions','POST',long);assert.equal(result.status,200)
  const path=`/api/documents/reference/versions/${result.body.result.version.id}/export`
  const word=(await call(path+'?format=docx')).body,text=(await mammoth.extractRawText({buffer:word})).value;assert.match(text,/Expérience 69/);assert.ok(text.indexOf('Compétences')<text.indexOf('Présentation'));assert.doesNotMatch(text,/https/)
  const bytes=(await call(path+'?format=pdf')).body,task=getDocument({data:new Uint8Array(bytes)}),doc=await task.promise
  try {assert.ok(doc.numPages>3);let text='';for(let i=1;i<=doc.numPages;i++)text+=(await(await doc.getPage(i)).getTextContent()).items.map(i=>i.str??'').join(' ');assert.match(text,/Expérience 69/);assert.match(text,/COMPÉTENCE VÉRIFIÉE/)}finally{await task.destroy()}
  assert.equal((await call('/api/documents/invalid/versions','POST',{...input,layout:{...input.layout,order:['identity']}})).status,400)
})
