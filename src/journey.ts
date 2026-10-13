import { dataStore } from './data'
import type { Offer, Criterion, Qualification } from './journey-types'
import type { Application } from './types'
export const DECISION_LABELS = { pending: 'À décider', go: 'Poursuivre', later: 'Plus tard', rejected: 'Écartée' }
export const RESULT_LABELS = { met: 'Correspondance documentée', unmet: 'Incompatibilité documentée', unknown: 'À vérifier' }
export function saveOffer(input: Pick<Offer, 'id' | 'company' | 'title' | 'text' | 'url' | 'note'>) {
  return dataStore.mutate<Offer>(() => ({ method: 'PUT', path: `offers/${encodeURIComponent(input.id)}`, body: input, apply: (state, saved) => ({ ...state, journey: { ...state.journey, offers: [...state.journey.offers.filter((item) => item.id !== saved.id), saved] } }) }))
}
export function saveCriteria(criteria: Criterion[]) {
  return dataStore.mutate<Criterion[]>(() => ({ method: 'PUT', path: 'criteria', body: criteria, apply: (state, saved) => ({ ...state, journey: { ...state.journey, criteria: saved } }) }))
}
export function qualifyOffer(offerId: string, input: Pick<Qualification, 'id' | 'entries' | 'analysis' | 'cvVersionId' | 'proposals' | 'proposalModel'> & Partial<Pick<Qualification, 'cvText' | 'offerText'>>) {
  return dataStore.mutate<Qualification>(() => ({ method: 'POST', path: `offers/${encodeURIComponent(offerId)}/qualification`, body: input, apply: (state, saved) => ({ ...state, journey: { ...state.journey, qualifications: [...state.journey.qualifications, saved] } }) }))
}
export function decideOffer(offerId: string, decision: 'go' | 'later' | 'rejected', reason: string) {
  return dataStore.mutate<{ offer: Offer; application?: Application }>(() => ({ method: 'POST', path: `offers/${encodeURIComponent(offerId)}/decision`, body: { decision, reason }, apply: (state, saved) => ({ ...state, applications: saved.application ? [...state.applications.filter((item) => item.id !== saved.application!.id), saved.application] : state.applications, journey: { ...state.journey, offers: state.journey.offers.map((item) => item.id === saved.offer.id ? saved.offer : item) } }) }))
}
