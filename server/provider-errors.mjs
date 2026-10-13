import { providerCodes, validRequestId, diagnosticExplanation } from '../shared/domain/ai-diagnostics.mjs'
export function providerDiagnostic({ status = null, response, headers, secret, kind = 'provider' }) {
  const candidate = response?.code ?? response?.error?.code
  const safe = value => !(secret && value.toLowerCase().includes(secret.toLowerCase()))
  const code = typeof candidate === 'string' && Object.hasOwn(providerCodes, candidate) && safe(candidate) ? candidate : null
  const trace = headers?.get?.('x-request-id')
  return { version: 1, kind, httpStatus: status, providerCode: code, requestId: validRequestId(trace) && safe(trace) ? trace : null }
}
export function providerError(options) {
  const diagnostic = providerDiagnostic(options)
  const name = options.provider === 'mistral' ? 'Mistral' : 'Z.ai'
  const code = diagnostic.providerCode ? ' Code fournisseur : '+diagnostic.providerCode+'.' : ''
  const trace = diagnostic.requestId ? ' Référence fournisseur : '+diagnostic.requestId+'.' : ''
  return { error: name+' ('+options.status+') : '+diagnosticExplanation(diagnostic)+code+trace+' Référence JobPilot : '+options.attemptId+'. Aucun nouvel essai automatique.' }
}
