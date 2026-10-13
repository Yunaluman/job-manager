import { Link } from '@tanstack/react-router'
import { useData, usePersistenceStatus } from '../../data'
import { actionNotifications, dossiersToDecide } from '../../../shared/domain/actions-core.mjs'
import { usePlanningDay } from '../../PlanningClock'
import { notificationStageLabel } from '../../actions'

export function PlanningSummary() {
  const { actions, applications, notificationReads, interviewPlans } = useData()
  const persistence = usePersistenceStatus()
  const day = usePlanningDay()
  if (!persistence.ready || persistence.blocked || persistence.pending > 0) return <section className="app-panel mb-6 p-5"><h2 className="font-semibold">À traiter maintenant</h2><p role="status" className="mt-3 text-sm text-muted">{persistence.blocked ? 'Planning indisponible : synchronise les données.' : 'Chargement ou confirmation en cours…'}</p></section>
  const alerts = actionNotifications(actions, applications, notificationReads, day, interviewPlans)
  const undecided = dossiersToDecide(applications, actions, interviewPlans)
  return <section className="app-panel mb-6 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">À traiter maintenant</h2><Link className="app-primary" to="/actions" search={{}}>Organiser mes actions</Link></div><p className="mt-3 text-sm text-muted">{alerts.filter((item) => item.stage === 'overdue' && item.origin !== 'interview').length} échéance(s) en retard · {alerts.filter(item => item.stage === 'overdue' && item.origin === 'interview').length} entretien(s) à clarifier · {alerts.filter((item) => item.stage === 'today').length} aujourd’hui · {alerts.filter((item) => item.stage === 'tomorrow').length} demain · {undecided.length} dossier(s) à décider</p>
    <ul className="mt-3 space-y-2 text-sm">{alerts.slice(0, 3).map((item) => <li key={item.id} className="break-words">{notificationStageLabel(item)} — {item.title}{item.interviewPlanId && <Link className="ml-2 underline" to="/actions" search={{ interview: item.interviewPlanId }}>Voir l’entretien</Link>}</li>)}</ul>
    {!alerts.length && <p className="mt-3 text-sm text-muted">Aucune échéance urgente connue. Les actions sans date restent à planifier.</p>}
  </section>
}
