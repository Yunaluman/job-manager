import { Button } from '../../shared/ui/Button'
import { useMemo } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useData, usePersistenceStatus } from '../../data'
import { usePlanningDay } from '../../PlanningClock'
import { defaultReviewPeriod, strategyReview } from '../../../shared/domain/strategy-review.mjs'
import type { Evidence, ReviewGroup, ReviewSummary } from '../../../shared/domain/strategy-review.mjs'

const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
const format = (value: number | null, unit = '') => value === null ? '—' : `${number.format(value)}${unit}`
const eventLabels = { sent: 'Envoi', response: 'Réponse', interview: 'Entretien', offer: 'Offre', refusal: 'Refus' }
const dateLabel = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : value

function EvidenceList({ rows }: { rows: Evidence[] }) {
  if (!rows.length) return <p className="py-3 text-sm text-muted">Aucun dossier dans cette liste.</p>
  return <ul className="divide-y divide-line text-sm">{rows.map((row) => <li key={row.application.id} className="space-y-1 py-3 break-words">
    <Link to="/candidatures/$id" params={{ id: row.application.id }} className="font-medium underline">{row.application.company || 'Entreprise non renseignée'} · {row.application.title || 'Intitulé non renseigné'}</Link>
    <p>Premier envoi connu : {row.sendDate ? dateLabel(row.sendDate) : 'non renseigné'}{row.responseDate && ` · Première réponse retenue : ${dateLabel(row.responseDate)} (${format(row.responseDays ?? null)} j)`}</p>
    <p className="text-muted">Étapes datées : {row.events.length ? row.events.map((event) => `${eventLabels[event.kind]} ${dateLabel(event.occurredAt)}`).join(' ; ') : 'aucune'}</p>
    {row.reasons && <p className="text-amber-800 dark:text-amber-300">{row.reasons.join(' · ')}</p>}
  </li>)}</ul>
}

type Metric = { label: string; value: (s: ReviewSummary) => number | null; rows: keyof Pick<ReviewSummary, 'rows' | 'answered' | 'interviews' | 'offers' | 'refusals' | 'unanswered'>; unit?: string; deltaUnit?: string }
const metrics: Metric[] = [
  { label: 'Dossiers envoyés', value: (s) => s.rows.length, rows: 'rows' },
  { label: 'Réponses documentées', value: (s) => s.answered.length, rows: 'answered' },
  { label: 'Entretiens', value: (s) => s.interviews.length, rows: 'interviews' },
  { label: 'Offres', value: (s) => s.offers.length, rows: 'offers' },
  { label: 'Refus', value: (s) => s.refusals.length, rows: 'refusals' },
  { label: 'Sans réponse documentée', value: (s) => s.unanswered.length, rows: 'unanswered' },
  { label: 'Taux de réponse', value: (s) => s.responseRate, rows: 'answered', unit: ' %', deltaUnit: ' pts' },
  { label: 'Taux d’entretien', value: (s) => s.interviewRate, rows: 'interviews', unit: ' %', deltaUnit: ' pts' },
  { label: 'Délai médian de réponse', value: (s) => s.medianDays, rows: 'answered', unit: ' j', deltaUnit: ' j' },
]

function MetricEvidence({ label, summary, metric }: { label: string; summary: ReviewSummary; metric: Metric }) {
  return <details className="mt-2 rounded-lg border border-line p-3">
    <summary className="cursor-pointer text-sm">{label} : <strong>{format(metric.value(summary), metric.unit)}</strong> · Voir les dossiers</summary>
    {metric.unit === ' %' && <p className="mt-2 text-sm text-muted">{summary[metric.rows].length} / {summary.rows.length} dossiers envoyés. La liste ci-dessous est le numérateur.</p>}
    {metric.unit === ' j' && <p className="mt-2 text-sm text-muted">Médiane sur {summary.answered.length} dossier(s) avec réponse documentée uniquement.</p>}
    <EvidenceList rows={summary[metric.rows]} />
    {metric.unit === ' %' && <details className="mt-2"><summary className="cursor-pointer text-sm">Dénominateur : tous les dossiers envoyés</summary><EvidenceList rows={summary.rows} /></details>}
  </details>
}

function Breakdown({ title, groups }: { title: string; groups: ReviewGroup[] }) {
  return <section className="app-panel p-4 sm:p-6"><h2 className="text-lg font-semibold">{title}</h2>
    <p className="mt-1 text-sm text-muted">Ordre alphabétique. Ouvre une ligne pour retrouver les chiffres et leurs dossiers, sur les deux périodes.</p>
    {!groups.length && <p className="mt-4 text-sm">Aucun dossier envoyé sur ces périodes.</p>}
    {groups.map((group) => <details key={group.key} className="mt-3 border-t border-line pt-3">
      <summary className="cursor-pointer break-words text-sm font-medium">{group.label} · {group.current.rows.length} envoi(s) sur la période sélectionnée / {group.previous.rows.length} sur la précédente</summary>
      <div className="mt-4 grid gap-4 md:grid-cols-2">{metrics.map((metric) => <div key={metric.label} className="min-w-0"><h3 className="text-sm font-semibold">{metric.label}</h3><MetricEvidence label="Sélection" summary={group.current} metric={metric} /><MetricEvidence label="Précédente" summary={group.previous} metric={metric} /></div>)}</div>
    </details>)}
  </section>
}

export function StrategyReviewPage() {
  const data = useData()
  const status = usePersistenceStatus()
  const today = usePlanningDay()
  const defaults = defaultReviewPeriod(today)
  const search = useSearch({ from: '/bilan' })
  const navigate = useNavigate({ from: '/bilan' })
  const from = search.from ?? defaults.from, to = search.to ?? defaults.to
  const result = useMemo(() => {
    try { return { review: strategyReview(data.applications, data.journey.submissions, from, to, today), error: '' } }
    catch (error) { return { review: null, error: error instanceof Error ? error.message : 'Période invalide.' } }
  }, [data.applications, data.journey.submissions, from, to, today])
  const review = result.review
  const qualityLabels = { incomplete: 'Historiques incomplets', missingSend: 'Sans date d’envoi exploitable', missingSource: 'Source non renseignée', missingTitle: 'Intitulé non renseigné', anomalies: 'Dossiers avec dates incohérentes' } as const
  return <div className="mx-auto max-w-6xl space-y-6">
    <div><p className="app-eyebrow">Prendre du recul</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Bilan de la recherche</h1><p className="mt-2 text-sm text-muted">Des faits datés pour examiner ta recherche, sans classement ni recommandation automatique.</p></div>
    <form key={`${from}:${to}`} className="app-panel flex flex-wrap items-end gap-4 p-4" onSubmit={(event) => {
      event.preventDefault()
      const fields = new FormData(event.currentTarget)
      void navigate({ search: { from: String(fields.get('from')), to: String(fields.get('to')) } })
    }}>
      <label className="grid gap-1 text-sm">Premier envoi à partir du<input name="from" className="app-field" type="date" required max={defaults.to} defaultValue={from} /></label>
      <label className="grid gap-1 text-sm">Jusqu’au (inclus)<input name="to" className="app-field" type="date" required max={defaults.to} defaultValue={to} /></label>
      <Button className="app-button" type="submit">Comparer</Button><Button className="app-button" type="button" onClick={() => void navigate({ search: defaults })}>30 derniers jours terminés</Button>
    </form>
    {result.error && <p role="alert" className="app-panel p-4 text-amber-800 dark:text-amber-300">{result.error}</p>}
    {status.blocked || status.error ? <p role="alert" className="app-panel p-4">Bilan indisponible : {status.error || 'synchronisation nécessaire'}. Utilise la synchronisation en haut de page.</p>
      : !status.ready || status.pending > 0 ? <p role="status" className="app-panel p-4">Chargement des données confirmées…</p>
      : review && <>
        <section className="app-panel space-y-2 p-4 text-sm">
          <h2 className="font-semibold">Deux périodes de {review.periods.days} jours</h2>
          <p>Sélection : {dateLabel(from)} — {dateLabel(to)} · Précédente : {dateLabel(review.periods.previous.from)} — {dateLabel(review.periods.previous.to)}</p>
          <p>Chaque dossier est rattaché à son premier envoi connu et compté une seule fois. Les résultats sont observés jusqu’à la fin de chaque période : les réponses ultérieures sont exclues de cette comparaison.</p>
          <p>Un envoi tardif dans une période laisse moins de temps pour observer une réponse. Les effectifs et les historiques incomplets limitent l’interprétation des taux. Les statuts seuls ne prouvent aucune étape.</p>
          <p className="text-muted">Le tableau de bord présente des chiffres globaux ; ce bilan utilise des populations et des périodes délimitées. Les dates suivent le calendrier Europe/Paris.</p>
        </section>
        {!review.current.rows.length && <p className="text-sm">Aucun premier envoi connu sur la période sélectionnée.</p>}
        <section aria-label="Indicateurs comparés" className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{metrics.map((metric) => {
          const current = metric.value(review.current), previous = metric.value(review.previous)
          const delta = current === null || previous === null ? null : current - previous
          return <article key={metric.label} className="app-panel min-w-0 p-4"><h2 className="font-semibold">{metric.label}</h2><p className="mt-3 text-2xl font-semibold tabular-nums">{format(current, metric.unit)}</p><p className="mt-1 text-xs text-muted">Écart sélection − précédente : {delta !== null && delta > 0 ? '+' : ''}{format(delta, metric.deltaUnit)}</p><MetricEvidence label="Sélection" summary={review.current} metric={metric} /><MetricEvidence label="Précédente" summary={review.previous} metric={metric} /></article>
        })}</section>
        <Breakdown title="Par source" groups={review.sources} /><Breakdown title="Par intitulé de poste" groups={review.titles} />
        <section className="app-panel p-4 sm:p-6"><h2 className="text-lg font-semibold">Qualité des données</h2><p className="mt-1 text-sm text-muted">Sur tous les dossiers actuellement chargés, indépendamment des périodes. Les catégories peuvent se recouper. Les dossiers archivés ou exclus restent comptés lorsqu’un envoi est daté. Les dossiers supprimés ne peuvent pas être reconstitués. Aucune donnée n’est corrigée par ce bilan.</p>
          {Object.entries(qualityLabels).map(([key, label]) => <details key={key} className="mt-3 border-t border-line pt-3"><summary className="cursor-pointer text-sm">{label} : {review.quality[key as keyof typeof qualityLabels].length}</summary><EvidenceList rows={review.quality[key as keyof typeof qualityLabels]} /></details>)}
          <details className="mt-3 border-t border-line pt-3"><summary className="cursor-pointer text-sm">Déclarations actives sans dossier : {review.quality.orphanSubmissions.length}</summary><p className="mt-2 text-sm text-muted">Exclues des calculs. Le dossier lié n’est plus accessible.</p><ul className="mt-2 space-y-2 text-sm">{review.quality.orphanSubmissions.map((item) => <li key={item.id} className="break-all">Déclaration {item.id} · {dateLabel(item.occurredAt)} · dossier {item.applicationId}</li>)}</ul></details>
        </section>
      </>}
  </div>
}
