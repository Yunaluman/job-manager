import { providerDiagnostic, providerError } from '../../provider-errors.mjs'
import { qualificationPrompt, validateQualificationProposals } from '../../../shared/domain/qualification-core.mjs'
import { prefillPrompt, validatePrefill } from '../../../shared/domain/cv-prefill.mjs'
import { cvText } from '../../../shared/domain/cv-document.mjs'
import { journeySnapshot } from '../../journey.mjs'
import { PROVIDERS, providerForUrl } from '../../credentials.mjs'
import { PURPOSES } from '../../ai-monitoring.mjs'

export function createAiService({ db, credentials, monitoring, fetchProvider }) {
  let inFlight = false
  return async (req, res) => {
    let { prompt, baseUrl, model, purpose, sourceId, offerId, cvVersionId, maxTokens = 1600, temperature = 0.3 } = req.body ?? {}
    let original, qualificationSources
    if (purpose === 'cv-structuring') {
      const row = typeof sourceId === 'string' && db.prepare('SELECT data FROM cv_originals WHERE id = ?').get(sourceId)
      if (!row) return res.status(400).json({ error: 'Original CV absent.' })
      original = JSON.parse(row.data); prompt = prefillPrompt(original.text)
    } else if (sourceId !== undefined) return res.status(400).json({ error: 'Source non autorisée pour cet appel.' })
    if (purpose === 'offer-qualification') {
      const row = typeof offerId === 'string' && db.prepare('SELECT data FROM offers WHERE id = ?').get(offerId)
      if (!row) return res.status(400).json({error:'Offre absente.'})
      const offer = JSON.parse(row.data), criteria = journeySnapshot(db).criteria
      let selectedText = credentials.settings().cvText ?? ''
      if (cvVersionId !== undefined) {
        const versionRow = typeof cvVersionId === 'string' && db.prepare('SELECT data FROM document_versions WHERE id = ?').get(cvVersionId)
        if (!versionRow) return res.status(400).json({error:'Version CV absente.'})
        const version = JSON.parse(versionRow.data), documentRow = db.prepare('SELECT data FROM documents WHERE id = ?').get(version.documentId), document = documentRow && JSON.parse(documentRow.data)
        if (version.templateVersion !== 'single-column-cv-v1' || !document || (document.applicationId && document.applicationId !== offer.applicationId)) return res.status(400).json({error:'Version CV incompatible.'})
        selectedText = cvText(version.content,version.layout)
      }
      if (!criteria.length || !selectedText.trim()) return res.status(400).json({error:'Critères et CV requis.'})
      qualificationSources = {criteria,cvText:selectedText,offerText:offer.text}; prompt = qualificationPrompt(criteria,selectedText,offer.text)
    } else if (offerId !== undefined || cvVersionId !== undefined) return res.status(400).json({error:'Références non autorisées pour cet appel.'})
    const provider = providerForUrl(baseUrl)
    if ((original || qualificationSources) && prompt.length > 30000) return res.status(400).json({error:'Sources trop longues pour cet appel. Aucun envoi au fournisseur ; le brouillon est conservé.'})
    if (!provider || !PURPOSES.includes(purpose) || typeof prompt !== 'string' || !prompt.trim() || prompt.length > 30000 || typeof model !== 'string' || !/^[\w./:-]{1,120}$/.test(model) || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 2000 || ![0, 0.3].includes(temperature) || Object.keys(req.body).some((key) => !['prompt', 'baseUrl', 'model', 'purpose', 'sourceId', 'offerId', 'cvVersionId', 'maxTokens', 'temperature'].includes(key))) return res.status(400).json({ error: 'Requête IA invalide.' })
    if (inFlight) return res.status(429).json({ error: 'Un appel IA est déjà en cours.' })
    const key = credentials.get(provider)
    if (!key) return res.status(400).json({ error: 'Aucune clé pour ce fournisseur.' })
    if (model.includes(key)) return res.status(400).json({ error: 'Modèle invalide.' })
    // Refuse dispatch if the durable attempt cannot be committed and read back.
    let attempt
    try { attempt = monitoring.begin({ purpose, provider, model }) }
    catch { return res.status(503).json({ error: 'Journal IA indisponible. Aucun appel fournisseur envoyé.' }) }
    inFlight = true
    let diagnostic
    let outcome = { status: 'uncertain', errorKind: 'transport' }, reply = { error: 'Appel fournisseur interrompu ou indisponible.' }, httpStatus = 502
    try {
      const result = await fetchProvider(`${PROVIDERS[provider]}/chat/completions`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(45000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature, max_tokens: maxTokens, ...(provider === 'mistral' ? { service_tier: 'standard_only' } : {}) }),
      })
      diagnostic = providerDiagnostic({status: result.status, headers: result.headers, secret: key, kind: result.ok ? 'success' : 'provider'})
      if (!result.ok) {
        const response = await result.json().catch(() => undefined)
        outcome = { status: 'error', errorKind: 'provider', response }
        diagnostic = providerDiagnostic({status:result.status, response, headers:result.headers, secret:key})
        reply = providerError({status:result.status, provider, response, headers:result.headers, secret:key, attemptId:attempt.event.id})
      } else {
        const response = await result.json()
        const content = response?.choices?.[0]?.message?.content
        if (typeof content !== 'string' || content.length > 100000 || content.includes(key)) {
          outcome = { status: 'error', errorKind: 'response', response }
          reply = { error: 'Réponse du fournisseur invalide.' }
        } else {
          if (original || qualificationSources) {
            try { if (original) validatePrefill(JSON.parse(content).proposals, original.text); else validateQualificationProposals(JSON.parse(content).proposals,qualificationSources.criteria,qualificationSources.cvText,qualificationSources.offerText) }
            catch { outcome = { status: 'error', errorKind: 'response', response }; reply = { error: 'Réponse structurée invalide ou sans preuve source. Le brouillon est conservé.' }; httpStatus = 502 }
          }
          if (outcome.errorKind !== 'response') { outcome = { status: 'success', response }; reply = { content }; httpStatus = 200 }
        }
      }
    } catch (error) {
      outcome = error instanceof SyntaxError ? { status: 'error', errorKind: 'response' } : { status: 'uncertain', errorKind: ['TimeoutError', 'AbortError'].includes(error?.name) ? 'timeout' : 'transport' }
    } finally {
      try { monitoring.finish(attempt, { ...outcome, secret: key, diagnostic: { ...(diagnostic ?? providerDiagnostic({secret:key})), kind: outcome.errorKind ?? 'success' } }) }
      catch {
        // Keep the original pending row: never retry a paid call on a logging error.
        reply = { ...reply, monitoringWarning: 'Résultat du journal non confirmé ; coût inconnu. Ne relance pas cet appel pour cette raison.' }
      }
      inFlight = false
    }
    res.status(httpStatus).json(reply)
  }
}
