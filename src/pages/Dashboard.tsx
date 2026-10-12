import { TrendingUp, Send, MessageSquare, XCircle, Trophy, Globe } from 'lucide-react'
import type { Application } from '../types'
import { useApplications } from '../storage'
import { funnelMetrics, applicationEvents } from '../application-events.mjs'
import { PlanningSummary } from '../components/PlanningSummary'

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: number | null
  accent: string
}) {
  return (
    <div className="app-panel p-5">
      <div className={`mb-3 inline-flex rounded-xl p-2.5 ${accent}`}>{icon}</div>
      <div className="text-3xl font-bold tabular-nums">{value ?? '—'}</div>
      <div className="mt-1 text-sm text-muted">{label}</div>
    </div>
  )
}

function SourceStats({ apps }: { apps: Application[] }) {
  // Group documented milestones; rates only use applications with dated sends.
  const documented = apps.filter((a) => applicationEvents(a).length > 0)
  const bySource = new Map<string, Application[]>()
  for (const a of documented) {
    const key = a.source?.trim() || 'Autre'
    bySource.set(key, [...(bySource.get(key) ?? []), a])
  }
  const rows = [...bySource.entries()]
    .map(([source, list]) => {
      const metrics = funnelMetrics(list)
      const entretiens = metrics.interviews
      return {
        source,
        envoyees: metrics.sent,
        entretiens,
        tauxReponse: metrics.responseRate,
        tauxEntretien: metrics.interviewRate,
      }
    })
    .sort((a, b) => b.envoyees - a.envoyees)

  if (rows.length === 0) return null

  return (
    <div className="mt-8 app-panel">
      <div className="flex items-center gap-2 border-b border-line px-5 py-4">
        <Globe size={16} className="text-sky-700 dark:text-sky-400" />
        <h2 className="font-semibold">Par plateforme</h2>
        <span className="ml-auto text-xs text-muted">étapes documentées</span>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-5 py-2.5 font-medium">Source</th>
            <th className="px-3 py-2.5 text-right font-medium">Envoyées</th>
            <th className="px-3 py-2.5 text-right font-medium">Entretiens</th>
            <th className="px-3 py-2.5 text-right font-medium">Tx réponse</th>
            <th className="px-5 py-2.5 font-medium">Tx entretien</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.source}>
              <td className="px-5 py-3 font-medium">{r.source}</td>
              <td className="px-3 py-3 text-right tabular-nums text-secondary">{r.envoyees}</td>
              <td className="px-3 py-3 text-right tabular-nums text-secondary">{r.entretiens}</td>
              <td className="px-3 py-3 text-right tabular-nums text-secondary">{r.tauxReponse === null ? '—' : `${r.tauxReponse}%`}</td>
              <td className="px-5 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-full max-w-32 overflow-hidden rounded-full bg-subtle">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{ width: `${r.tauxEntretien ?? 0}%` }}
                    />
                  </div>
                  <span className="w-9 text-right text-xs tabular-nums text-muted">
                    {r.tauxEntretien === null ? '—' : `${r.tauxEntretien}%`}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  )
}

export function Dashboard() {
  const apps = useApplications()
  const metrics = funnelMetrics(apps)

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight sm:text-3xl">Tableau de bord</h1>
      <p className="mb-8 text-sm text-muted">Vue d'ensemble de ta recherche d'emploi.</p>
      <PlanningSummary />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard icon={<Send size={18} />} label="Envois datés" value={metrics.sent} accent="bg-sky-500/15 text-sky-700 dark:text-sky-300" />
        <StatCard icon={<MessageSquare size={18} />} label="Entretiens datés" value={metrics.interviews} accent="bg-violet-500/15 text-violet-700 dark:text-violet-300" />
        <StatCard icon={<Trophy size={18} />} label="Offres datées" value={metrics.offers} accent="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" />
        <StatCard icon={<XCircle size={18} />} label="Refus datés" value={metrics.refusals} accent="bg-rose-500/15 text-rose-700 dark:text-rose-300" />
        <StatCard icon={<TrendingUp size={18} />} label="Taux entretien (%)" value={metrics.interviewRate} accent="bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" />
      </div>

      {metrics.unknownHistory > 0 && <p className="mt-4 text-sm text-muted">Historique incomplet pour {metrics.unknownHistory} dossier(s). Les étapes non documentées ne sont pas comptées. Les taux concernent uniquement les dossiers ayant un envoi daté.</p>}
      <SourceStats apps={apps} />
    </div>
  )
}
