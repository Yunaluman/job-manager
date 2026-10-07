import { Link } from '@tanstack/react-router'
import { AlertCircle, TrendingUp, Send, MessageSquare, XCircle, Trophy, Globe } from 'lucide-react'
import type { Application } from '../types'
import { useApplications, isDue } from '../storage'
import { StatusBadge } from '../components/StatusBadge'

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: number
  accent: string
}) {
  return (
    <div className="app-panel p-5">
      <div className={`mb-3 inline-flex rounded-xl p-2.5 ${accent}`}>{icon}</div>
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      <div className="mt-1 text-sm text-muted">{label}</div>
    </div>
  )
}

function SourceStats({ apps }: { apps: Application[] }) {
  // On ne compte que les candidatures réellement envoyées
  const sent = apps.filter((a) => a.status !== 'a_postuler')
  const bySource = new Map<string, Application[]>()
  for (const a of sent) {
    const key = a.source?.trim() || 'Autre'
    bySource.set(key, [...(bySource.get(key) ?? []), a])
  }
  const rows = [...bySource.entries()]
    .map(([source, list]) => {
      const entretiens = list.filter((a) => a.status === 'entretien' || a.status === 'offre').length
      const reponses = entretiens + list.filter((a) => a.status === 'refusee').length
      return {
        source,
        envoyees: list.length,
        entretiens,
        tauxReponse: Math.round((reponses / list.length) * 100),
        tauxEntretien: Math.round((entretiens / list.length) * 100),
      }
    })
    .sort((a, b) => b.envoyees - a.envoyees)

  if (rows.length === 0) return null

  return (
    <div className="mt-8 app-panel">
      <div className="flex items-center gap-2 border-b border-line px-5 py-4">
        <Globe size={16} className="text-sky-700 dark:text-sky-400" />
        <h2 className="font-semibold">Par plateforme</h2>
        <span className="ml-auto text-xs text-muted">où investir ton temps</span>
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
              <td className="px-3 py-3 text-right tabular-nums text-secondary">{r.tauxReponse}%</td>
              <td className="px-5 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-full max-w-32 overflow-hidden rounded-full bg-subtle">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{ width: `${r.tauxEntretien}%` }}
                    />
                  </div>
                  <span className="w-9 text-right text-xs tabular-nums text-muted">
                    {r.tauxEntretien}%
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
  const due = apps.filter(isDue)
  const active = apps.filter((a) => a.status !== 'refusee' && a.status !== 'a_postuler')
  const entretiens = apps.filter((a) => a.status === 'entretien' || a.status === 'offre')
  const tauxReponse = active.length
    ? Math.round((entretiens.length / active.length) * 100)
    : 0

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight sm:text-3xl">Tableau de bord</h1>
      <p className="mb-8 text-sm text-muted">Vue d'ensemble de ta recherche d'emploi.</p>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard icon={<Send size={18} />} label="Candidatures envoyées" value={active.length} accent="bg-sky-500/15 text-sky-700 dark:text-sky-300" />
        <StatCard icon={<MessageSquare size={18} />} label="Entretiens" value={apps.filter((a) => a.status === 'entretien').length} accent="bg-violet-500/15 text-violet-700 dark:text-violet-300" />
        <StatCard icon={<Trophy size={18} />} label="Offres" value={apps.filter((a) => a.status === 'offre').length} accent="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" />
        <StatCard icon={<XCircle size={18} />} label="Refus" value={apps.filter((a) => a.status === 'refusee').length} accent="bg-rose-500/15 text-rose-700 dark:text-rose-300" />
        <StatCard icon={<TrendingUp size={18} />} label="Taux entretien (%)" value={tauxReponse} accent="bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" />
      </div>

      <div className="app-panel">
        <div className="flex items-center gap-2 border-b border-line px-5 py-4">
          <AlertCircle size={16} className="text-amber-700 dark:text-amber-400" />
          <h2 className="font-semibold">Relances à faire ({due.length})</h2>
        </div>
        {due.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            Rien à relancer aujourd'hui. 🎉{' '}
            <Link to="/candidatures" className="text-indigo-700 dark:text-indigo-400 hover:underline">
              Voir les candidatures
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {due.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium">{a.company}</div>
                  <div className="text-sm text-muted">{a.title}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-amber-700 dark:text-amber-400">
                    prévu le {new Date(a.nextActionAt!).toLocaleDateString('fr-FR')}
                  </span>
                  <StatusBadge status={a.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <SourceStats apps={apps} />
    </div>
  )
}
