import { dataStore } from './data'

export const purposeNames = { 'cv-structuring': 'Structuration du CV', 'offer-extraction': 'Extraction d’offre', 'cv-analysis': 'Analyse du CV', 'letter-generation': 'Rédaction de lettre' }
export const statusNames = { 'in-progress': 'En cours / résultat non confirmé', success: 'Réussi', error: 'Erreur', uncertain: 'Incertain' }
export const usageNames: Record<string, string> = { pending: 'en attente', absent: 'absent', invalid: 'invalide', unsupported: 'catégorie non prise en charge', valid: 'valide' }
export const errorNames: Record<string, string> = { provider: 'Refus du fournisseur', response: 'Réponse invalide', transport: 'Connexion interrompue', timeout: 'Délai dépassé', restart: 'Redémarrage : résultat inconnu' }
export const costReasons: Record<string, string> = { 'in-progress': 'Appel en cours ou journal non confirmé', interrupted: 'Interruption : résultat inconnu', 'usage-absent': 'Usage absent', 'usage-invalid': 'Usage invalide', 'usage-unsupported': 'Catégorie de tokens non prise en charge', 'tariff-unknown': 'Tarif inconnu', 'category-unknown': 'Tarif de catégorie inconnu', 'amount-out-of-range': 'Montant hors limites', 'model-unknown': 'Modèle retourné absent ou invalide', estimated: 'Estimation documentée' }
export interface Tariff {
  id: string; provider: 'mistral' | 'zai'; model: string; currency: 'USD'; effectiveAt: string; verifiedAt: string; source: string
  inputMilliUsd: number; outputMilliUsd: number; cachedInputMilliUsd: number | null
}
export interface AiConfig { monthlyLimitCents: number | null; tariffs: Tariff[] }
export interface AiEvent {
  id: string; purpose: keyof typeof purposeNames; provider: string; requestedModel: string; returnedModel: string | null
  startedAt: string; endedAt: string | null; durationMs: number | null; status: keyof typeof statusNames; errorKind: string | null
  inputTokens: number | null; outputTokens: number | null; cachedInputTokens: number | null; usageState: string
  costNanoUsd: number | null; costReason: string; tariff: Tariff | null
}
export interface AiSummary {
  currency: string; estimatedNanoUsd: string; known: number; unknown: number; errors: number; usageUnknown: number; inputTokens: string; outputTokens: string
  breakdown: { purpose: keyof typeof purposeNames; provider: string; model: string; known: number; unknown: number; estimatedNanoUsd: string }[]
}
export interface AiBudget extends AiSummary { month: string; monthlyLimitCents: number | null; exceeded: boolean; uncertain: boolean }
export { usd, tokenNumber } from './ai-format.mjs'
export function saveAiConfig(path: string, method: 'PUT' | 'POST', body: unknown) {
  return dataStore.mutate<AiConfig>(() => ({ method, path, body, apply: (state, aiConfig) => ({ ...state, aiConfig }) }))
}
