const codes = Object.freeze({
  tier_not_allowed: 'Le plan API associé à cette clé ne permet pas cette requête.',
  insufficient_permissions: 'Les permissions associées à cette clé sont insuffisantes.',
  unknown_model: 'Le fournisseur ne reconnaît pas ce modèle.',
  model_not_found: 'Le fournisseur ne trouve pas ce modèle.',
  invalid_api_key: 'La clé API est invalide.',
  rate_limit_exceeded: 'Une limite de requêtes ou de tokens est atteinte.',
  insufficient_quota: 'Le quota disponible est insuffisant.',
})

export function providerError({ status, provider, response, headers, secret, attemptId }) {
  const name = provider === 'mistral' ? 'Mistral' : 'Z.ai'
  const candidate = response?.code ?? response?.error?.code
  // Never relay arbitrary provider messages: they can echo credentials or source text.
  const code = typeof candidate === 'string' && Object.hasOwn(codes, candidate) ? candidate : null
  let detail = code ? `${codes[code]} Code fournisseur : ${code}.` : status === 401
    ? 'Clé API invalide ou expirée.' : status === 403
      ? 'Accès refusé. Le motif précis n’est pas identifié ; vérifie les permissions de la clé et le plan API de son organisation. Ce statut seul ne prouve pas un manque de crédits.'
      : status === 429 ? 'Limite de requêtes ou de capacité atteinte.'
        : status === 402 ? 'Le fournisseur demande de vérifier la facturation API.'
          : 'Le fournisseur a refusé la requête.'
  const trace = headers?.get?.('x-request-id')
  const safeTrace = typeof trace === 'string' && /^(?:[a-f0-9]{16,64}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(trace) && !trace.includes(secret)
    ? ` Référence fournisseur : ${trace}.` : ''
  detail += `${safeTrace} Référence JobPilot : ${attemptId}. Aucun nouvel essai automatique.`
  return { error: `${name} (${status}) : ${detail}` }
}
