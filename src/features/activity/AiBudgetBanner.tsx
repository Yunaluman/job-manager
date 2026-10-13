import { useEffect, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { apiGet } from '../../api'
import { useData } from '../../data'
import { type AiBudget, usd } from '../../ai-monitoring'

export function AiBudgetBanner() {
  const { aiConfig } = useData()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const [budget, setBudget] = useState<AiBudget | null>(null)
  const [warning, setWarning] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    let request = 0
    const load = async () => {
      const current = ++request
      try { const result = await apiGet<AiBudget>('ai/budget'); if (active && current === request) { setBudget(result); setError('') } }
      catch { if (active && current === request) { setBudget(null); setError('Budget IA indisponible ; son respect ne peut pas être évalué.') } }
    }
    const changed = (event: Event) => { if (typeof (event as CustomEvent).detail === 'string' && (event as CustomEvent).detail) setWarning((event as CustomEvent).detail); void load() }
    void load()
    window.addEventListener('jobpilot-ai-updated', changed)
    return () => { active = false; window.removeEventListener('jobpilot-ai-updated', changed) }
  }, [pathname, aiConfig])
  const message = warning || (aiConfig.monthlyLimitCents !== null ? error : '')
  if (!message && !budget?.exceeded && !budget?.uncertain) return null
  return <aside role="status" className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
    {message && <p>{message}</p>}
    {budget?.exceeded && <p>Seuil IA dépassé pour {budget.month} (UTC) : {usd(budget.estimatedNanoUsd)} estimés connus.</p>}
    {budget?.uncertain && <p>{budget.unknown} appel(s) au coût inconnu empêchent d’évaluer le budget complet.</p>}
    <Link to="/activite-ia" className="mt-2 inline-block font-semibold underline">Consulter l’activité IA</Link><p className="mt-1 text-xs">Ces alertes ne bloquent pas les appels.</p>
  </aside>
}
