import { Panel } from '../../shared/ui/Panel'
import { PageHeading } from '../../shared/ui/PageHeading'
import { TrendingUp, Send, MessageSquare, XCircle, Trophy, Globe } from 'lucide-react'
import type { Application } from '../../../shared/contracts/types'
import { useApplications } from '../../storage'
import { funnelMetrics, applicationEvents } from '../../../shared/domain/application-events.mjs'
import { PlanningSummary } from '../planning/PlanningSummary'
import { JourneySummary } from '../applications/JourneySummary'
import { useData, usePersistenceStatus } from '../../data'
import { withDeclaredSends } from '../../../shared/domain/journey-progress.mjs'
import { Link } from '@tanstack/react-router'

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
    <Panel className="p-4 sm:p-5">
      <div className={`mb-2 inline-flex rounded-lg p-2 ${accent}`}>{icon}</div>
      <div className="text-2xl font-bold tabular-nums sm:text-3xl">{value ?? '—'}</div>
      <div className="mt-1 text-xs text-muted sm:text-sm">{label}</div>
    </Panel>
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
  const submissions = useData().journey.submissions
  const apps = useApplications().map(app=>withDeclaredSends(app,submissions))
  const metrics = funnelMetrics(apps)
  const persistence = usePersistenceStatus()
  const confirmed = persistence.ready && !persistence.blocked && persistence.pending === 0

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeading title="Tableau de bord" description="Tes dossiers et les prochaines actions." />
      {confirmed ? <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Indicateurs documentés">
        <StatCard icon={<Send size={18} />} label="Envois datés" value={metrics.sent} accent="bg-sky-500/15 text-sky-700 dark:text-sky-300" />
        <StatCard icon={<MessageSquare size={18} />} label="Entretiens datés" value={metrics.interviews} accent="bg-violet-500/15 text-violet-700 dark:text-violet-300" />
        <StatCard icon={<Trophy size={18} />} label="Offres datées" value={metrics.offers} accent="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" />
        <StatCard icon={<XCircle size={18} />} label="Refus datés" value={metrics.refusals} accent="bg-rose-500/15 text-rose-700 dark:text-rose-300" />
        <StatCard icon={<TrendingUp size={18} />} label="Taux entretien (%)" value={metrics.interviewRate} accent="bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" />
      </div> : <p role="status" className="my-4 text-sm text-muted">{persistence.blocked ? 'Statistiques indisponibles : synchronise les données.' : 'Chargement ou confirmation en cours…'}</p>}
      <div className="mb-8 grid gap-3 sm:grid-cols-3" aria-label="Accès rapides">
        <Link to="/offres" className="app-panel group p-5"><p className="app-eyebrow">Explorer</p><h2 className="font-semibold">Qualifier une offre <span aria-hidden="true">↗</span></h2><p className="mt-2 text-sm text-muted">Vérifier les correspondances avant de décider.</p></Link>
        <Link to="/actions" className="app-panel p-5"><p className="app-eyebrow">Avancer</p><h2 className="font-semibold">Organiser la suite <span aria-hidden="true">↗</span></h2><p className="mt-2 text-sm text-muted">Relances, préparation et entretiens à suivre.</p></Link>
        <Link to="/bilan" className="app-panel p-5"><p className="app-eyebrow">Comprendre</p><h2 className="font-semibold">Faire le point <span aria-hidden="true">↗</span></h2><p className="mt-2 text-sm text-muted">Comparer les périodes à partir des faits datés.</p></Link>
      </div>
      <PlanningSummary />
      <JourneySummary />

      {confirmed && <>

      {metrics.unknownHistory > 0 && <p className="mt-4 text-sm text-muted">Historique incomplet pour {metrics.unknownHistory} dossier(s). Les étapes non documentées ne sont pas comptées. Les taux concernent uniquement les dossiers ayant un envoi daté.</p>}
      <SourceStats apps={apps} />
      </>}
    </div>
  )
}
