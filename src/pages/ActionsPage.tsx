import { useEffect, useState } from 'react'
import { Link, useSearch } from '@tanstack/react-router'
import { useData, usePersistenceStatus } from '../data'
import type { Action, ActionInput } from '../action-types'
import { KIND_LABELS, PRIORITY_LABELS, STATUS_LABELS } from '../actions'
import { actionBucket, sortActions, sourceDeadlines, dossiersToDecide } from '../actions-core.mjs'
import { usePlanningDay } from '../PlanningClock'
import { ActionForm } from '../components/ActionForm'
import { InterviewPlans } from '../components/InterviewPlans'

const inputFor = ({ createdAt: _createdAt, updatedAt: _updatedAt, history: _history, ...input }: Action): ActionInput => input
const fresh = (): ActionInput => ({ id: crypto.randomUUID(), title: '', kind: 'other', priority: 'normal', status: 'todo', note: '', resultNote: '' })
const dateLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })
const historyLabels = { created: 'Créée', updated: 'Modifiée', rescheduled: 'Reportée', done: 'Terminée', cancelled: 'Annulée', reopened: 'Rouverte' }
const buckets = { overdue: 'En retard', today: 'Aujourd’hui', week: 'Cette semaine', later: 'Plus tard', unplanned: 'À planifier' }

export function ActionsPage() {
  const { actions, applications, interviewPlans } = useData()
  const persistence = usePersistenceStatus()
  const day = usePlanningDay()
  const search = useSearch({ strict: false }) as { action?: string; app?:string; interview?: string }
  const [editing, setEditing] = useState<ActionInput | null>(()=>search.app?{...fresh(),applicationId:search.app}:null)
  const [completed, setCompleted] = useState(false)
  const sources = sourceDeadlines(applications, actions)
  const undecided = dossiersToDecide(applications, actions, interviewPlans)
  const confirmed = persistence.ready && !persistence.blocked && persistence.pending === 0
  useEffect(() => {
    const action = actions.find((item) => item.id === search.action)
    if (action && action.status !== 'todo') setCompleted(true)
    if (action) document.getElementById(`action-${action.id}`)?.scrollIntoView({ block: 'center' })
  }, [search.action, actions, completed])
  const renderAction = (action: Action) => {
    const dossier = applications.find((app) => app.id === action.applicationId)
    const sourceChanged = action.source && dossier?.nextActionAt !== action.source.dueDate
    const interview = interviewPlans.find(plan => plan.id === action.interviewPlan?.id)
    return <article id={`action-${action.id}`} key={action.id} className={`app-panel p-4 ${search.action === action.id ? 'ring-2 ring-indigo-500' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="break-words font-semibold">{action.title}</h3><p className="mt-1 text-sm text-muted">{KIND_LABELS[action.kind]} · Priorité {PRIORITY_LABELS[action.priority].toLowerCase()} · {STATUS_LABELS[action.status]}</p></div><span className="text-sm">{action.dueDate ? dateLabel(action.dueDate) : 'Sans échéance'}</span></div>
      {dossier ? <Link className="mt-2 inline-block text-sm text-indigo-700 dark:text-indigo-300" to="/candidatures/$id" params={{ id: dossier.id }}>{dossier.company} — {dossier.title}</Link> : <p className="mt-2 text-sm text-muted">{action.applicationId ? 'Dossier supprimé — lien historique conservé. Tu peux détacher l’action.' : 'Action générale'}</p>}
      {action.note && <p className="mt-3 whitespace-pre-wrap break-words text-sm">{action.note}</p>}
      {action.resultNote && <p className="mt-3 whitespace-pre-wrap break-words text-sm">Résultat déclaré : {action.resultNote}</p>}
      {action.source && <p className="mt-2 text-xs text-muted">Relance source du {dateLabel(action.source.dueDate)}{dossier?.register && ` · copie CSV importée le ${new Date(dossier.register.importedAt).toLocaleDateString('fr-FR')}`}. L’action locale reste indépendante du registre.</p>}
      {sourceChanged && <p role="status" className="mt-2 text-sm text-amber-700 dark:text-amber-300">Échéance source différente : {dossier?.nextActionAt ? dateLabel(dossier.nextActionAt) : 'absente ou dossier supprimé'}. L’action n’a pas été déplacée automatiquement.</p>}
      {action.interviewPlan && <p className="mt-2 text-xs text-muted"><Link className="underline" to="/actions" search={{ interview: action.interviewPlan.id }}>Entretien lié</Link> · date lors du rattachement : {dateLabel(action.interviewPlan.scheduledDate)}{interview && interview.scheduledDate !== action.interviewPlan.scheduledDate && ` · date annoncée actuelle : ${dateLabel(interview.scheduledDate)}. La préparation n’a pas été déplacée.`}{interview && interview.status !== 'planned' && ' · suivi d’entretien clos ou annulé ; préparation conservée.'}</p>}
      <div className="mt-3 flex flex-wrap gap-2"><button className="app-button" disabled={persistence.blocked || !persistence.ready} onClick={() => setEditing(inputFor(action))}>Modifier / reporter</button>
        {action.status === 'todo' ? <><button className="app-button" onClick={() => setEditing({ ...inputFor(action), status: 'done' })} disabled={persistence.blocked || !persistence.ready}>Terminer</button><button className="app-button" onClick={() => setEditing({ ...inputFor(action), status: 'cancelled' })} disabled={persistence.blocked || !persistence.ready}>Annuler l’action</button></> : <button className="app-button" onClick={() => setEditing({ ...inputFor(action), status: 'todo' })} disabled={persistence.blocked || !persistence.ready}>Rouvrir</button>}
      </div>
      <details className="mt-3 text-xs"><summary className="cursor-pointer text-muted">Historique ({action.history.length})</summary><ul className="mt-2 space-y-2">{action.history.map((entry, index) => <li key={index} className="whitespace-pre-wrap break-words">{new Date(entry.at).toLocaleString('fr-FR')} — {historyLabels[entry.event]} · {STATUS_LABELS[entry.status]}{entry.dueDate && ` · ${dateLabel(entry.dueDate)}`}{entry.note && ` — ${entry.note}`}</li>)}</ul></details>
    </article>
  }
  const open = sortActions(actions.filter((action) => action.status === 'todo'))
  return <div className="mx-auto max-w-5xl">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">Actions</h1><p className="mt-2 text-sm text-muted">Quoi faire, pour quand, avec quel résultat. Dates en Europe/Paris ; semaine du lundi au dimanche.</p></div><button className="app-primary" disabled={persistence.blocked || !persistence.ready} onClick={() => setEditing(fresh())}>Nouvelle action</button></div>
    <InterviewPlans selectedId={search.interview} />
    {!confirmed ? <p role="status" className="my-4 text-sm text-muted">{persistence.blocked ? 'Actions indisponibles : synchronise les données.' : 'Chargement ou confirmation en cours…'}</p> : <>
    {Object.entries(buckets).map(([key, label]) => { const group = open.filter((action) => actionBucket(action, day) === key); return <section className="mb-6" key={key}><h2 className="mb-3 font-semibold">{label} ({group.length})</h2><div className="space-y-3">{group.map(renderAction)}{!group.length && <p className="text-sm text-muted">Aucune action.</p>}</div></section> })}
    <section className="app-panel mb-6 p-5"><h2 className="mb-2 font-semibold">Échéances sources ({sources.length})</h2><p className="mb-3 text-sm text-muted">Dates des dossiers, sans recopie automatique. Une copie CSV reflète son dernier import.</p><ul className="space-y-4">{sources.map(({ application: app, dueDate, managedActionId }) => <li key={app.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3"><div className="min-w-0"><Link className="text-sm text-indigo-700 dark:text-indigo-300" to="/candidatures/$id" params={{ id: app.id }}>{app.company} — {app.title}</Link><p className="text-sm">Relance : {dateLabel(dueDate)}</p>{app.register && <p className="text-xs text-muted">Copie CSV importée le {new Date(app.register.importedAt).toLocaleDateString('fr-FR')}</p>}</div>
      {managedActionId ? <Link className="app-button" to="/actions" search={{ action: managedActionId }}>Voir l’action liée</Link> : <button className="app-button" disabled={persistence.blocked || !persistence.ready} onClick={() => setEditing({ ...fresh(), title: `Relancer ${app.company}`, kind: 'follow-up', dueDate, applicationId: app.id, source: { applicationId: app.id, dueDate } })}>Préparer une action</button>}</li>)}</ul>{!sources.length && <p className="text-sm text-muted">Aucune échéance source active.</p>}</section>
    <section className="app-panel mb-6 p-5"><h2 className="mb-3 font-semibold">Prochaine action à décider ({undecided.length})</h2><ul className="space-y-3">{undecided.map((app) => <li key={app.id} className="flex flex-wrap items-center justify-between gap-3"><Link to="/candidatures/$id" params={{ id: app.id }} className="text-sm text-indigo-700 dark:text-indigo-300">{app.company} — {app.title}</Link><button className="app-button" disabled={persistence.blocked || !persistence.ready} onClick={() => setEditing({ ...fresh(), applicationId: app.id, kind: 'decide', title: `Décider de la suite pour ${app.company}` })}>Décider d’une action</button></li>)}</ul>{!undecided.length && <p className="text-sm text-muted">Aucun dossier ouvert sans action, échéance source ou entretien planifié.</p>}</section>
    <button className="app-button mb-4" onClick={() => setCompleted((value) => !value)} aria-expanded={completed}>Actions terminées et annulées ({actions.filter((action) => action.status !== 'todo').length})</button>
    {completed && <div className="space-y-3">{sortActions(actions.filter((action) => action.status !== 'todo')).map(renderAction)}</div>}
    </>}
    {editing && <ActionForm key={editing.id} initial={editing} onClose={() => setEditing(null)} />}
  </div>
}
