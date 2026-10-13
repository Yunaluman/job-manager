import { Button } from '../../shared/ui/Button'
import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useData, usePersistenceStatus } from '../../data'
import type { InterviewPlanInput } from '../../../shared/contracts/interview-types'
import type { ActionInput } from '../../../shared/contracts/action-types'
import { INTERVIEW_STATUS_LABELS, INTERVIEW_HISTORY_LABELS, interviewInput, interviewDateLabel } from '../../interviews'
import { usePlanningDay } from '../../PlanningClock'
import { InterviewPlanForm } from './InterviewPlanForm'
import { ActionForm } from './ActionForm'

export function InterviewPlans({ applicationId, selectedId }: { applicationId?: string; selectedId?: string }) {
  const { interviewPlans, applications, actions } = useData(), persistence = usePersistenceStatus(), day = usePlanningDay()
  const [editing, setEditing] = useState<InterviewPlanInput | null>(null), [preparing, setPreparing] = useState<ActionInput | null>(null), [closed, setClosed] = useState(false)
  const plans = interviewPlans.filter(plan => !applicationId || plan.applicationId === applicationId).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.id.localeCompare(b.id))
  const confirmed = persistence.ready && !persistence.blocked && persistence.pending === 0
  useEffect(() => {
    const selected = interviewPlans.find(plan => plan.id === selectedId)
    if (selected?.status !== 'planned' && selected) setClosed(true)
    if (selected && confirmed) document.getElementById(`interview-${selected.id}`)?.scrollIntoView({ block: 'center' })
  }, [selectedId, interviewPlans, closed, confirmed])
  const render = (plan: typeof plans[number]) => {
    const dossier = applications.find(app => app.id === plan.applicationId)
    const linked = actions.filter(action => action.interviewPlan?.id === plan.id)
    const open = linked.find(action => action.status === 'todo')
    return <article id={`interview-${plan.id}`} key={plan.id} className={`rounded-xl border border-line p-4 ${selectedId === plan.id ? 'ring-2 ring-indigo-500' : ''}`}>
      <h3 className="break-words font-semibold">{plan.title}</h3>
      <p className="mt-1 text-sm">{interviewDateLabel(plan.scheduledDate)} · {INTERVIEW_STATUS_LABELS[plan.status]}</p>
      {dossier ? <Link className="mt-2 inline-block text-sm underline" to="/candidatures/$id" params={{ id: dossier.id }}>{dossier.company} — {dossier.title}</Link> : <p className="mt-2 text-sm text-muted">Dossier supprimé — lien historique conservé ({plan.applicationId}).</p>}
      {dossier && (dossier.status === 'refusee' || (dossier.register && dossier.register.disposition !== 'active')) && <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">Dossier refusé ou inactif : vérifie ce rendez-vous. Son suivi n’a pas été annulé automatiquement.</p>}
      {plan.status === 'planned' && plan.scheduledDate < day && <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">Date passée — réalisation non renseignée dans ce suivi.</p>}
      <p className="mt-3 whitespace-pre-wrap break-words text-sm">Source déclarée : {plan.sourceDescription}</p>
      {plan.sourceReference && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted">Référence : {plan.sourceReference}</p>}
      {dossier?.register && <p className="mt-2 text-xs text-muted">Suivi local séparé de la copie CSV importée le {new Date(dossier.register.importedAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}.</p>}
      {plan.note && <p className="mt-3 whitespace-pre-wrap break-words text-sm">{plan.note}</p>}
      <div className="mt-3 flex flex-wrap gap-2"><Button type="submit" className="app-button" onClick={() => setEditing(interviewInput(plan))}>Modifier / reporter</Button>
        {plan.status === 'planned' ? <><Button type="submit" className="app-button" onClick={() => setEditing({ ...interviewInput(plan), status: 'closed' })}>Clore le suivi</Button><Button type="submit" className="app-button" onClick={() => setEditing({ ...interviewInput(plan), status: 'cancelled' })}>Annuler l’entretien</Button></> : <Button type="submit" className="app-button" onClick={() => setEditing({ ...interviewInput(plan), status: 'planned' })}>Rouvrir le suivi</Button>}
        {open ? <Link className="app-button" to="/actions" search={{ action: open.id }}>Ouvrir la préparation</Link> : dossier && plan.status === 'planned' && <Button type="submit" className="app-button" onClick={() => setPreparing({ id: crypto.randomUUID(), applicationId: plan.applicationId, title: `Préparer : ${plan.title}`, kind: 'prepare-interview', dueDate: plan.scheduledDate, priority: 'normal', note: '', resultNote: '', status: 'todo', interviewPlan: { id: plan.id, scheduledDate: plan.scheduledDate } })}>Préparer cet entretien</Button>}
      </div>
      {linked.length > 0 && <ul className="mt-3 space-y-2 text-xs">{linked.map(action => <li key={action.id}><Link className="underline" to="/actions" search={{ action: action.id }}>{action.title}</Link> · {action.status === 'todo' ? 'Ouverte' : action.status === 'done' ? 'Terminée' : 'Annulée'}{action.interviewPlan!.scheduledDate !== plan.scheduledDate && <p className="text-amber-700 dark:text-amber-300">Préparation liée à la date du {interviewDateLabel(action.interviewPlan!.scheduledDate)}. Son échéance reste {action.dueDate ? interviewDateLabel(action.dueDate) : 'non renseignée'}.</p>}</li>)}</ul>}
      <details className="mt-3 text-xs"><summary>Historique du suivi ({plan.history.length})</summary><ol className="mt-2 space-y-3">{plan.history.map((entry, index) => <li key={index} className="whitespace-pre-wrap break-words">{new Date(entry.at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} — {INTERVIEW_HISTORY_LABELS[entry.event]} · {interviewDateLabel(entry.values.scheduledDate)} · {INTERVIEW_STATUS_LABELS[entry.values.status]}{'\n'}{entry.values.title}{'\n'}Source : {entry.values.sourceDescription}{entry.values.sourceReference && `\nRéférence : ${entry.values.sourceReference}`}{entry.values.note && `\nNote : ${entry.values.note}`}</li>)}</ol></details>
    </article>
  }
  return <section className="app-panel my-5 p-5" aria-label="Entretiens planifiés">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Entretiens planifiés</h2><Button type="submit" className="app-button" disabled={!confirmed || !applications.length} onClick={() => setEditing({ id: crypto.randomUUID(), applicationId: applicationId ?? '', title: '', scheduledDate: '', sourceDescription: '', sourceReference: '', note: '', status: 'planned' })}>Planifier un entretien</Button></div>
    <p className="my-3 text-sm text-muted">Dates annoncées et suivi local. La préparation et les étapes réalisées se renseignent séparément.</p>
    {!confirmed ? <p role="status" className="text-sm text-muted">{persistence.blocked ? 'Suivi indisponible : synchronise les données.' : 'Chargement ou confirmation en cours…'}</p> : <>
      <div className="space-y-3">{plans.filter(plan => plan.status === 'planned').map(render)}</div>
      {!plans.some(plan => plan.status === 'planned') && <p className="text-sm text-muted">Aucun entretien planifié connu.</p>}
      <Button type="submit" className="app-button my-3" aria-expanded={closed} onClick={() => setClosed(value => !value)}>Suivis clos et annulés ({plans.filter(plan => plan.status !== 'planned').length})</Button>
      {closed && <div className="space-y-3">{plans.filter(plan => plan.status !== 'planned').map(render)}</div>}
    </>}
    {editing && <InterviewPlanForm key={editing.id} initial={editing} existing={interviewPlans.some(plan => plan.id === editing.id)} onClose={() => setEditing(null)} />}
    {preparing && <ActionForm key={preparing.id} initial={preparing} onClose={() => setPreparing(null)} />}
  </section>
}
