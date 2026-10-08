import { Link } from '@tanstack/react-router'
import { useData } from '../data'
import { actionNotifications, dossiersToDecide } from '../actions-core.mjs'
import { usePlanningDay } from '../PlanningClock'
import { STAGE_LABELS } from '../actions'

export function PlanningSummary() {
  const { actions, applications, notificationReads } = useData()
  const day = usePlanningDay()
  const alerts = actionNotifications(actions, applications, notificationReads, day)
  const undecided = dossiersToDecide(applications, actions)
  return <section className="app-panel mb-6 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">À traiter maintenant</h2><Link className="app-primary" to="/actions" search={{}}>Organiser mes actions</Link></div><p className="mt-3 text-sm text-muted">{alerts.filter((item) => item.stage === 'overdue').length} échéance(s) en retard · {alerts.filter((item) => item.stage === 'today').length} aujourd’hui · {alerts.filter((item) => item.stage === 'tomorrow').length} demain · {undecided.length} dossier(s) à décider</p>
    <ul className="mt-3 space-y-2 text-sm">{alerts.slice(0, 3).map((item) => <li key={item.id} className="break-words">{STAGE_LABELS[item.stage]} — {item.title}</li>)}</ul>
    {!alerts.length && <p className="mt-3 text-sm text-muted">Aucune échéance urgente connue. Les actions sans date restent à planifier.</p>}
  </section>
}
