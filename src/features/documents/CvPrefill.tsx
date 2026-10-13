import { Button } from '../../shared/ui/Button'
import { useState } from 'react'
import { useData } from '../../data'
import { apiRequest } from '../../api'
import { hasApiKey, providerId } from '../../cv'
import { localPrefill, validatePrefill, type PrefillProposal } from '../../../shared/domain/cv-prefill.mjs'
import type { CvContent, PrefillTrace } from '../../../shared/contracts/document-types'
import { DraftGuard } from '../../components/DraftGuard'
export type { PrefillTrace } from '../../../shared/contracts/document-types'
const labels: Record<keyof CvContent,string> = {name:'Nom',title:'Titre professionnel',contact:'Coordonnées',summary:'Présentation',experiences:'Expériences',education:'Formations',skills:'Compétences',languages:'Langues',links:'Liens'}
const display = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value,null,2)
export function CvPrefill({ current, apply, profileApply }: { profileApply?: (patch: Partial<Pick<CvContent,'name'|'title'|'contact'>>) => void; current: CvContent; apply: (content: CvContent, trace: PrefillTrace) => void }) {
  const { cvOriginals, settings } = useData(), [alsoProfile, setAlsoProfile] = useState(false), [sourceId, setSourceId] = useState(''), [proposals,setProposals] = useState<PrefillProposal[]>([]), [selected,setSelected] = useState<(keyof CvContent)[]>([]), [mode,setMode] = useState<'local'|'api'>('local'), [model,setModel] = useState(''), [busy,setBusy] = useState(false), [error,setError] = useState(''), [message,setMessage] = useState('')
  const source = cvOriginals.find(value => value.id === sourceId)
  async function suggest() {
    if (!source) return; setBusy(true); setError('')
    try {
      const result = await apiRequest<{content:string;monitoringWarning?:string}>('POST','ai',{prompt:'Structure CV',sourceId:source.id,purpose:'cv-structuring',baseUrl:settings.baseUrl,model:settings.model,maxTokens:2000,temperature:0})
      setProposals(validatePrefill(JSON.parse(result.content).proposals,source.text)); setSelected([]); setMode('api'); setModel(settings.model); setMessage(result.monitoringWarning ?? '')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Propositions indisponibles.') }
    finally { setBusy(false); window.dispatchEvent(new CustomEvent('jobpilot-ai-updated')) }
  }
  return <section className="my-4 rounded-lg border border-indigo-500/40 p-4"><DraftGuard dirty={proposals.length > 0} /><h3 className="font-semibold">Préremplir depuis un original — à vérifier</h3><label className="my-3 block">Fichier source<select className="app-field" value={sourceId} disabled={busy} onChange={event => {setSourceId(event.target.value);setProposals([]);setSelected([]);setError('')}}><option value="">Choisir un original conservé</option>{cvOriginals.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
    <div className="flex flex-wrap gap-2"><Button type="button" className="app-button" disabled={!source || busy} onClick={() => {if(source){setProposals(localPrefill(source.text));setSelected([]);setMode('local');setModel('');setMessage('Suggestions locales : seuls les champs explicitement détectables sont proposés.')}}}>Proposer les coordonnées localement</Button><Button type="button" className="app-button" disabled={!source || busy || !hasApiKey(settings)} onClick={() => void suggest()}>{busy ? 'Structuration…' : 'Proposer une structure avec l’IA'}</Button></div>
    <p className="my-2 text-xs text-muted">Le bouton IA transmet le texte de l’original à {providerId(settings)} · modèle {settings.model}. Aucun envoi au dépôt. Les champs inconnus restent vides.</p>{message && <p role="status" className="text-sm">{message}</p>}{error && <p role="alert" className="text-rose-700">{error}</p>}
    {proposals.map(item => <div key={item.field} className="my-3 border-t border-line pt-3"><label className="font-medium"><input type="checkbox" checked={selected.includes(item.field)} onChange={event => setSelected(event.target.checked ? [...selected,item.field] : selected.filter(field => field !== item.field))} /> Appliquer {labels[item.field]}</label><div className="mt-2 grid gap-3 sm:grid-cols-2"><div><p className="text-xs text-muted">Valeur actuelle</p><pre className="whitespace-pre-wrap break-words text-sm">{display(current[item.field]) || 'Non renseigné'}</pre></div><div><p className="text-xs text-muted">Proposition {mode === 'local' ? 'locale' : `IA · ${model}`}</p><pre className="whitespace-pre-wrap break-words text-sm">{display(item.value)}</pre></div></div><p className="mt-2 whitespace-pre-wrap break-words text-xs">Source : {item.evidence}</p></div>)}
    {profileApply && proposals.length > 0 && <label className="my-3 block text-sm"><input type="checkbox" checked={alsoProfile} onChange={event => setAlsoProfile(event.target.checked)} /> Appliquer aussi les coordonnées sélectionnées au brouillon du profil (enregistrement séparé)</label>}
    {proposals.length > 0 && <Button type="button" className="app-primary mt-3" disabled={!selected.length || busy} onClick={() => {if(!source)return; const next={...current}; for(const item of proposals) if(selected.includes(item.field)) Object.assign(next,{[item.field]:item.value}); if(alsoProfile && profileApply) profileApply(Object.fromEntries(proposals.filter(item => selected.includes(item.field) && ['name','title','contact'].includes(item.field)).map(item => [item.field,item.value]))); apply(next,{originalId:source.id,mode,model,proposals,appliedFields:selected});setProposals([]);setSelected([]);setMessage('Propositions appliquées au brouillon. Vérifie les champs puis enregistre une nouvelle version.')}}>Appliquer les champs sélectionnés au brouillon</Button>}
  </section>
}
