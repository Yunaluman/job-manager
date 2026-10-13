import { cloneElement, useEffect, useRef, useState } from 'react'
import { Activity, RefreshCw, ShieldCheck } from 'lucide-react'
import { apiGet } from '../api'
import { useData } from '../data'
import { DraftGuard } from '../components/DraftGuard'
import { type AiBudget, type AiEvent, type AiSummary, type Tariff, costReasons, errorNames, usageNames, purposeNames, saveAiConfig, statusNames, tokenNumber, usd } from '../ai-monitoring'

const currentMonth = () => new Date().toISOString().slice(0, 7)
const blankRate = () => ({ provider: 'mistral' as Tariff['provider'], model: '', input: '', output: '', cached: '', effective: new Date().toISOString().slice(0, 16), source: 'https://docs.mistral.ai/inference/pricing', verified: false })
const time = (value: string) => new Date(value).toLocaleString('fr-FR')
const field = (label: string, content: React.ReactElement<{ 'aria-label'?: string }>) => <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted"><span>{label}</span>{cloneElement(content, { 'aria-label': label })}</label>
const milli = (value: string) => {
  if (!/^\d+(\.\d{1,3})?$/.test(value)) throw new Error('Les tarifs doivent avoir au plus trois décimales, en USD par million de tokens.')
  return Math.round(Number(value) * 1000)
}

export function AiActivityPage() {
  const { aiConfig } = useData()
  const [filters, setFilters] = useState({ from: `${currentMonth()}-01`, to: '', purpose: '', provider: '', model: '', status: '', cost: '' })
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [result, setResult] = useState<{ events: AiEvent[]; total: number; summary: AiSummary; budget: AiBudget } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [configError, setConfigError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [budgetDraft, setBudgetDraft] = useState<{ enabled: boolean; limit: string } | null>(null)
  const [rate, setRate] = useState(blankRate)
  const rateRef = useRef(rate)
  useEffect(() => { rateRef.current = rate }, [rate])
  const [rateDirty, setRateDirty] = useState(false)
  const budgetValues = budgetDraft ?? { enabled: aiConfig.monthlyLimitCents !== null, limit: aiConfig.monthlyLimitCents === null ? '' : (aiConfig.monthlyLimitCents / 100).toFixed(2) }
  const dirty = budgetDraft !== null || rateDirty
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) {
      if (!value) continue
      const date = key === 'from' || key === 'to' ? new Date(`${value}T00:00:00.000Z`) : null
      if (date && key === 'to') date.setUTCDate(date.getUTCDate() + 1)
      query.set(key, date ? date.toISOString() : value)
    }
    void Promise.all([
      apiGet<{ events: AiEvent[]; total: number }>(`ai/activity?${query}&page=${page}&pageSize=20`),
      apiGet<AiSummary>(`ai/summary?${query}`), apiGet<AiBudget>('ai/budget'),
    ]).then(([history, summary, budget]) => { if (active) setResult({ ...history, summary, budget }) })
      .catch((e) => { if (active) { setResult(null); setError(e instanceof Error ? e.message : 'Activité indisponible.') } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filters, page, refresh, aiConfig])
  const setFilter = (key: keyof typeof filters, value: string) => { setFilters((current) => ({ ...current, [key]: value })); setPage(1) }
  const setRateField = <K extends keyof typeof rate>(key: K, value: (typeof rate)[K]) => { setRate((current) => ({ ...current, [key]: value })); setRateDirty(true); setMessage('') }
  async function saveBudget(event: React.FormEvent) {
    event.preventDefault(); if (saving) return
    setSaving(true); setConfigError(''); setMessage('')
    const submitted = budgetDraft
    try {
      if (budgetValues.enabled && !/^\d+(\.\d{1,2})?$/.test(budgetValues.limit)) throw new Error('Indique un montant positif ou nul avec au plus deux décimales.')
      await saveAiConfig('ai/config', 'PUT', { monthlyLimitCents: budgetValues.enabled ? Math.round(Number(budgetValues.limit) * 100) : null })
      setBudgetDraft((current) => current === submitted ? null : current)
      setMessage('Seuil confirmé. Les appels restent autorisés.')
    } catch (e) { setConfigError(e instanceof Error ? e.message : 'Enregistrement non confirmé.') }
    finally { setSaving(false) }
  }
  async function saveRate(event: React.FormEvent) {
    event.preventDefault(); if (saving) return
    setSaving(true); setConfigError(''); setMessage('')
    const submitted = rate
    try {
      await saveAiConfig('ai/tariffs', 'POST', { provider: rate.provider, model: rate.model.trim(), currency: 'USD', effectiveAt: new Date(`${rate.effective}:00.000Z`).toISOString(), source: rate.source.trim(), inputMilliUsd: milli(rate.input), outputMilliUsd: milli(rate.output), cachedInputMilliUsd: rate.cached === '' ? null : milli(rate.cached), sourceVerified: rate.verified })
      if (rateRef.current === submitted) { setRate(blankRate()); setRateDirty(false) }
      setMessage('Nouvelle version de tarif confirmée. Les anciens coûts sont conservés.')
    } catch (e) { setConfigError(e instanceof Error ? e.message : 'Enregistrement non confirmé.') }
    finally { setSaving(false) }
  }
  return <div className="mx-auto max-w-6xl space-y-6">
    <DraftGuard dirty={dirty} />
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="app-eyebrow">Configuration · Intelligence artificielle</p><h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl"><Activity className="text-indigo-700 dark:text-indigo-300" />Activité IA</h1><p className="mt-2 max-w-2xl text-sm text-muted">Les appels de JobPilot depuis l’installation du suivi. Coûts estimés en USD, sans conversion : ce journal ne remplace pas la facture du fournisseur.</p></div><button className="app-button" disabled={loading} onClick={() => setRefresh((n) => n + 1)}><RefreshCw size={16} />Actualiser</button></div>
    <section aria-label="Filtres de l’activité" className="app-panel grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
      {field('Début (UTC)', <input type="date" className="app-field" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} />)}
      {field('Fin incluse (UTC)', <input type="date" className="app-field" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} />)}
      {field('Fonction', <select className="app-field" value={filters.purpose} onChange={(e) => setFilter('purpose', e.target.value)}><option value="">Toutes</option>{Object.entries(purposeNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>)}
      {field('Fournisseur', <select className="app-field" value={filters.provider} onChange={(e) => setFilter('provider', e.target.value)}><option value="">Tous</option><option value="mistral">Mistral</option><option value="zai">Z.ai</option></select>)}
      {field('Modèle exact', <input className="app-field" maxLength={120} value={filters.model} onChange={(e) => setFilter('model', e.target.value)} placeholder="Demandé ou retourné" />)}
      {field('Résultat', <select className="app-field" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}><option value="">Tous</option>{Object.entries(statusNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>)}
      {field('Coût des appels', <select className="app-field" value={filters.cost} onChange={(e) => setFilter('cost', e.target.value)}><option value="">Tous</option><option value="unknown">Coût inconnu uniquement</option><option value="estimated">Estimation disponible</option></select>)}
      <button className="app-button" onClick={() => { setFilters({ from: '', to: '', purpose: '', provider: '', model: '', status: '', cost: '' }); setPage(1) }}>Tout l’historique</button>
    </section>
    {error && <p role="alert" className="rounded-xl border border-rose-500/30 p-4 text-sm text-rose-700 dark:text-rose-300">{error} Utilise « Actualiser » après la reprise du serveur.</p>}
    {loading && <p role="status" className="text-sm text-muted">Chargement de l’activité…</p>}
    {!loading && result && <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[['Dépenses estimées connues', usd(result.summary.estimatedNanoUsd), `${result.summary.known} appel(s) chiffrés`], ['Coûts inconnus', result.summary.unknown, 'Exclus du montant, jamais assimilés à zéro'], ['Tokens disponibles', `${tokenNumber(result.summary.inputTokens)} / ${tokenNumber(result.summary.outputTokens)}`, `Entrée / sortie · ${result.summary.usageUnknown} usage(s) incomplet(s)`], ['Erreurs et incertitudes', result.summary.errors, 'Résultat fournisseur non confirmé ou en erreur']].map(([label, value, hint]) => <div key={label} className="app-panel p-5"><p className="text-xs text-muted">{label}</p><p className="mt-2 break-words text-xl font-semibold">{value}</p><p className="mt-2 text-xs text-muted">{hint}</p></div>)}
      </div>
      <section className="app-panel overflow-hidden"><div className="border-b border-line p-5"><h2 className="font-semibold">Historique des appels</h2><p className="mt-1 text-xs text-muted">Dates affichées dans ton fuseau local. Période et budget mensuel en UTC. Aucun prompt, CV, lettre ou clé n’est conservé ici.</p></div>
        {result.total === 0 ? <p className="p-8 text-center text-sm text-muted">Aucun appel sur cette période. Les appels antérieurs à l’installation ne sont pas reconstitués.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-xs"><thead className="bg-subtle text-muted"><tr>{['Début / fonction', 'Fournisseur / modèle', 'Résultat / durée', 'Tokens E / S / cache', 'Coût estimé / tarif'].map((label) => <th key={label} className="px-4 py-3 font-medium" scope="col">{label}</th>)}</tr></thead><tbody className="divide-y divide-line">{result.events.map((item) => <tr key={item.id} className="hover:bg-subtle/50"><td className="px-4 py-4"><p>{time(item.startedAt)}</p><p className="mt-1 font-medium">{purposeNames[item.purpose]}</p><p className="mt-1 text-[10px] text-muted">{item.id}</p></td><td className="max-w-64 break-words px-4 py-4"><p className="font-medium">{item.provider === 'zai' ? 'Z.ai' : 'Mistral'}</p><p className="mt-1">Demandé : {item.requestedModel}</p><p className="text-muted">Retourné : {item.returnedModel ?? 'Inconnu'}</p></td><td className="px-4 py-4"><span className={`rounded-lg px-2 py-1 ${item.status === 'success' ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-800 dark:text-amber-200'}`}>{statusNames[item.status]}</span><p className="mt-2 text-muted">{item.durationMs === null ? 'Durée inconnue' : `${(item.durationMs / 1000).toLocaleString('fr-FR')} s`}</p>{item.errorKind && <p className="text-muted">{errorNames[item.errorKind] ?? item.errorKind}</p>}</td><td className="px-4 py-4"><p>{tokenNumber(item.inputTokens)} / {tokenNumber(item.outputTokens)}</p><p className="mt-1 text-muted">Cache : {item.cachedInputTokens === null ? 'non rapporté' : tokenNumber(item.cachedInputTokens)}</p><p className="text-muted">Usage : {usageNames[item.usageState] ?? item.usageState}</p></td><td className="max-w-72 px-4 py-4"><p className="font-semibold">{item.costNanoUsd === null ? 'Coût inconnu' : usd(item.costNanoUsd)}</p><p className="mt-1 text-muted">{costReasons[item.costReason] ?? item.costReason}</p>{item.tariff && <details className="mt-2"><summary className="cursor-pointer text-indigo-700 dark:text-indigo-300">Tarif conservé</summary><p className="mt-2 break-all">Version : {item.tariff.id}</p><p>{item.tariff.inputMilliUsd / 1000} / {item.tariff.outputMilliUsd / 1000} USD / M tokens E / S</p><p>Effet : {time(item.tariff.effectiveAt)}</p><a className="underline" href={item.tariff.source} target="_blank" rel="noreferrer">Source officielle</a></details>}</td></tr>)}</tbody></table></div>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4"><p className="text-xs text-muted">{result.total} appel(s) · page {page} / {Math.max(1, Math.ceil(result.total / 20))}</p><div className="flex gap-2"><button className="app-button" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>Précédente</button><button className="app-button" disabled={page * 20 >= result.total} onClick={() => setPage((n) => n + 1)}>Suivante</button></div></div>
      </section>
      <section className="app-panel p-5"><h2 className="font-semibold">Ventilation des dépenses</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{result.summary.breakdown.map((group) => <div key={`${group.purpose}-${group.provider}-${group.model}`} className="min-w-0 rounded-xl bg-subtle p-4"><p className="text-xs text-muted">{purposeNames[group.purpose]} · {group.provider}</p><p className="mt-1 break-all text-sm font-medium">{group.model}</p><p className="mt-2 font-semibold">{group.known ? usd(group.estimatedNanoUsd) : 'Aucun coût chiffré'}</p><p className="mt-1 text-xs text-muted">{group.known} chiffré(s) · {group.unknown} inconnu(s)</p></div>)}</div>{!result.summary.breakdown.length && <p className="mt-3 text-sm text-muted">Aucune dépense à ventiler.</p>}</section>
    </>}
    <section className="app-panel p-5"><h2 className="font-semibold">Seuil mensuel facultatif</h2><p className="mt-2 text-sm text-muted">Désactivé par défaut. Une alerte locale signale un dépassement ou des coûts inconnus ; elle ne bloque aucun appel.</p><form onSubmit={(event) => void saveBudget(event)} className="mt-4 flex flex-wrap items-end gap-4"><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={budgetValues.enabled} onChange={(e) => setBudgetDraft({ ...budgetValues, enabled: e.target.checked })} />Activer le seuil</label>{field('Seuil en USD / mois UTC', <input className="app-field" inputMode="decimal" placeholder="10.00" disabled={!budgetValues.enabled} value={budgetValues.limit} onChange={(e) => setBudgetDraft({ ...budgetValues, limit: e.target.value })} />)}<button className="app-primary" disabled={saving || budgetDraft === null}>Confirmer le seuil</button></form>{result && <p className="mt-3 text-xs text-muted">Mois {result.budget.month} : {usd(result.budget.estimatedNanoUsd)} connus, {result.budget.unknown} coût(s) inconnu(s), indépendamment des filtres.</p>}</section>
    {configError && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{configError} Le brouillon est conservé.</p>}{message && <p role="status" className="text-sm text-emerald-800 dark:text-emerald-300">{message}</p>}
    <section className="app-panel p-5"><h2 className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} />Tarifs versionnés</h2><p className="mt-2 text-sm text-muted">Tarifs par million de tokens. Les modèles non référencés restent au tarif inconnu. Chaque ajout crée une version ; les estimations anciennes ne sont jamais recalculées. Vérifie la source officielle avant de confirmer un tarif.</p>
      <div className="mt-4 space-y-2">{aiConfig.tariffs.map((item) => <details key={item.id} className="rounded-xl border border-line p-3 text-xs"><summary className="cursor-pointer break-words font-medium">{item.provider} · {item.model} · effet {time(item.effectiveAt)} (local)</summary><p className="mt-2">Entrée : {item.inputMilliUsd / 1000} · sortie : {item.outputMilliUsd / 1000} · cache : {item.cachedInputMilliUsd === null ? 'non pris en charge' : item.cachedInputMilliUsd / 1000} USD / M tokens</p><p>Vérifié le {time(item.verifiedAt)} · {item.id}</p><a className="underline" href={item.source} target="_blank" rel="noreferrer">Source officielle</a></details>)}</div>
      <form className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" onSubmit={(event) => void saveRate(event)}>
        {field('Fournisseur du tarif', <select className="app-field" value={rate.provider} onChange={(e) => { const provider = e.target.value as Tariff['provider']; setRateField('provider', provider); setRateField('source', provider === 'mistral' ? 'https://docs.mistral.ai/inference/pricing' : 'https://docs.z.ai/guides/overview/pricing') }}><option value="mistral">Mistral</option><option value="zai">Z.ai</option></select>)}
        {field('Identifiant exact du modèle', <input required className="app-field" maxLength={120} value={rate.model} onChange={(e) => setRateField('model', e.target.value)} />)}
        {field('Date d’effet (UTC)', <input required className="app-field" type="datetime-local" value={rate.effective} onChange={(e) => setRateField('effective', e.target.value)} />)}
        {field('Entrée USD / M tokens', <input required inputMode="decimal" className="app-field" value={rate.input} onChange={(e) => setRateField('input', e.target.value)} />)}
        {field('Sortie USD / M tokens', <input required inputMode="decimal" className="app-field" value={rate.output} onChange={(e) => setRateField('output', e.target.value)} />)}
        {field('Entrée cache USD / M (facultatif)', <input inputMode="decimal" className="app-field" value={rate.cached} onChange={(e) => setRateField('cached', e.target.value)} />)}
        <div className="sm:col-span-2 xl:col-span-3">{field('URL de la documentation officielle', <input required type="url" className="app-field" value={rate.source} onChange={(e) => setRateField('source', e.target.value)} />)}</div>
        <label className="flex items-start gap-2 text-sm sm:col-span-2 xl:col-span-3"><input type="checkbox" className="mt-1" checked={rate.verified} onChange={(e) => setRateField('verified', e.target.checked)} />J’ai vérifié ce tarif USD pour ce modèle et ces catégories dans la source officielle.</label>
        <button className="app-primary" disabled={saving || !rate.verified || !rateDirty}>Confirmer la nouvelle version</button>
      </form>
    </section>
  </div>
}
