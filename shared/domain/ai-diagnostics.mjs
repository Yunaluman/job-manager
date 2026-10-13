export const providerCodes = Object.freeze({
  tier_not_allowed: 'Le plan API associé à cette clé ne permet pas cette requête.',
  insufficient_permissions: 'Les permissions associées à cette clé sont insuffisantes.',
  unknown_model: 'Le fournisseur ne reconnaît pas ce modèle.',
  model_not_found: 'Le fournisseur ne trouve pas ce modèle.',
  invalid_api_key: 'La clé API est invalide.',
  rate_limit_exceeded: 'Une limite de requêtes ou de tokens est atteinte.',
  insufficient_quota: 'Le quota disponible est insuffisant.',
})
export const validRequestId = value => typeof value === 'string' && /^(?:[a-f0-9]{16,64}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(value)
export function validateDiagnostic(value) {
  if (!value || value.version !== 1 || Object.keys(value).some(key=>!['version','kind','httpStatus','providerCode','requestId'].includes(key)) || !['provider','response','transport','timeout','restart','success'].includes(value.kind) || (value.httpStatus !== null && (!Number.isInteger(value.httpStatus) || value.httpStatus<100 || value.httpStatus>599)) || (value.providerCode !== null && !Object.hasOwn(providerCodes,value.providerCode)) || (value.requestId !== null && !validRequestId(value.requestId))) throw new Error('Invalid AI diagnostic.')
  return value
}
export function diagnosticExplanation(value) {
  if (!value) return 'Diagnostic non conservé'
  if (value.providerCode) return providerCodes[value.providerCode]
  if (value.kind === 'success') return 'Réponse reçue et validée.'
  if (value.kind === 'restart') return 'Appel interrompu par un redémarrage ; résultat fournisseur inconnu.'
  if (value.kind === 'timeout') return 'Délai dépassé ; résultat fournisseur inconnu.'
  if (value.kind === 'transport') return 'Connexion interrompue ; résultat fournisseur inconnu.'
  if (value.kind === 'response') return 'Réponse reçue mais invalide ou sans preuve source.'
  if (value.httpStatus === 401) return 'Clé API invalide ou expirée.'
  if (value.httpStatus === 403) return 'Accès refusé. Le motif précis n’est pas identifié ; vérifie les permissions de la clé et le plan API de son organisation. Ce statut seul ne prouve pas un manque de crédits.'
  if (value.httpStatus === 429) return 'Limite de requêtes ou de capacité atteinte.'
  if (value.httpStatus === 402) return 'Le fournisseur demande de vérifier la facturation API.'
  return 'Le fournisseur a refusé la requête ; motif précis inconnu.'
}
