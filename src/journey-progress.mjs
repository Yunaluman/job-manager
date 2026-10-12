import { applicationEvents } from './application-events.mjs'
import { sortActions } from './actions-core.mjs'
export function withDeclaredSends(application, submissions) {
  const events=applicationEvents(application),declared=submissions.filter(item=>item.applicationId===application.id&&!item.cancelledAt)
  return {...application,events:[...events,...declared.filter(item=>!events.some(event=>event.kind==='sent'&&event.occurredAt===item.occurredAt)).map(item=>({id:`declared:${item.id}`,kind:'sent',occurredAt:item.occurredAt,source:'manual'}))]}
}
export function nextJourneyStep(application, journey, actions) {
  if (application.status==='refusee' || application.register && application.register.disposition!=='active') return {tab:'summary',label:'Consulter le bilan du dossier',reason:'Ce dossier est clos.'}
  const sent=applicationEvents(withDeclaredSends(application,journey.submissions)).some(event=>event.kind==='sent')
  if(sent){const action=sortActions(actions.filter(item=>item.applicationId===application.id&&item.status==='todo'))[0];return {tab:'summary',label:action?'Traiter la prochaine action':'Décider de la prochaine action',reason:action?.title??'Un envoi daté existe ; organise la suite.',...(action?{actionId:action.id}:{})}}
  const ready=(kind)=>journey.documents.some(doc=>doc.applicationId===application.id&&doc.kind===kind&&journey.documentVersions.some(version=>version.id===doc.latestVersionId&&version.status==='ready'))
  if(!ready('cv'))return {tab:'documents',label:'Préparer le CV',reason:'Aucun CV courant validé pour ce dossier.'}
  if(!ready('letter'))return {tab:'documents',label:'Préparer la lettre',reason:'Aucune lettre courante validée pour ce dossier.'}
  return {tab:'summary',label:'Déclarer un envoi réalisé',reason:'Les documents sont prêts. Exporte-les puis postule ; renseigne ensuite la date réelle.'}
}
