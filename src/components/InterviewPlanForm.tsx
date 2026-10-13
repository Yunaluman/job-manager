import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { InterviewPlanInput } from '../interview-types'
import { useData, usePersistenceStatus, synchronize } from '../data'
import { saveInterviewPlan, INTERVIEW_STATUS_LABELS, interviewDateLabel } from '../interviews'
import { usePlanningDay } from '../PlanningClock'
import { useModalFocus } from '../useModalFocus'
import { DraftGuard } from './DraftGuard'

export function InterviewPlanForm({ initial, existing, onClose }: { initial: InterviewPlanInput; existing: boolean; onClose: () => void }) {
  const { applications, interviewPlans } = useData()
  const persistence = usePersistenceStatus(), day = usePlanningDay()
  const [draft, setDraft] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const inFlight = useRef(false)
  const originalRecord = useRef(JSON.stringify(interviewPlans.find(plan => plan.id === initial.id)))
  const latest = interviewPlans.find(plan => plan.id === initial.id)
  const changedElsewhere = existing && latest && JSON.stringify(latest) !== originalRecord.current
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const close = () => { if (!inFlight.current && (!dirty || window.confirm('Abandonner la saisie de cet entretien ?'))) onClose() }
  const modal = useModalFocus<HTMLFormElement>(true, close)
  const field = (key: keyof InterviewPlanInput, value: string) => setDraft(previous => ({ ...previous, [key]: value }))
  const missing = draft.applicationId && !applications.some(app => app.id === draft.applicationId)
  const similar = interviewPlans.some(plan => plan.id !== draft.id && plan.applicationId === draft.applicationId && plan.scheduledDate === draft.scheduledDate && plan.status === 'planned')
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3 sm:p-6">
    <DraftGuard dirty={dirty} />
    <form ref={modal} role="dialog" aria-modal="true" aria-label="Entretien planifié" className="app-modal max-h-[90vh] w-full max-w-xl overflow-y-auto" onSubmit={event => {
      event.preventDefault()
      if (inFlight.current) return
      const fields = new FormData(event.currentTarget)
      const input = { ...draft, title: String(fields.get('title')), scheduledDate: String(fields.get('scheduledDate')), sourceDescription: String(fields.get('sourceDescription')), sourceReference: String(fields.get('sourceReference')), note: String(fields.get('note')), status: String(fields.get('status')) as InterviewPlanInput['status'], applicationId: existing ? initial.applicationId : String(fields.get('applicationId')) }
      setDraft(input); inFlight.current = true; setBusy(true); setError('')
      void saveInterviewPlan(input).then(onClose).catch(reason => setError(reason instanceof Error ? reason.message : 'Écriture non confirmée. La saisie est conservée.'))
        .finally(() => { inFlight.current = false; setBusy(false) })
    }}>
      <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{existing ? 'Modifier le suivi d’entretien' : 'Planifier un entretien'}</h2><button className="app-button" type="button" aria-label="Fermer le formulaire d’entretien" disabled={busy} onClick={close}><X size={18} /></button></div>
      <p className="mb-4 text-sm text-muted">Date annoncée, au jour près en Europe/Paris. Clore ce suivi ne prouve pas que l’entretien a eu lieu.</p>
      <fieldset disabled={busy} className="space-y-3">
        <label className="block text-sm">Dossier lié<select className="app-field mt-1" name="applicationId" required disabled={existing} value={draft.applicationId} onChange={event => field('applicationId', event.target.value)}><option value="">Choisir un dossier</option>{missing && <option value={draft.applicationId}>Dossier supprimé — lien conservé</option>}{applications.map(app => <option key={app.id} value={app.id}>{app.company} — {app.title}{app.register ? ' (copie CSV)' : ''}</option>)}</select></label>
        <label className="block text-sm">Intitulé<input className="app-field mt-1" name="title" required maxLength={300} value={draft.title} onChange={event => field('title', event.target.value)} /></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm">Date annoncée (Europe/Paris)<input className="app-field mt-1" name="scheduledDate" type="date" required value={draft.scheduledDate} onChange={event => field('scheduledDate', event.target.value)} /></label>
          <label className="block text-sm">État du suivi<select className="app-field mt-1" name="status" value={draft.status} onChange={event => field('status', event.target.value)}>{Object.entries(INTERVIEW_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
        {draft.scheduledDate && draft.scheduledDate < day && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">Date passée : la réalisation reste inconnue tant qu’elle n’est pas documentée séparément.</p>}
        {similar && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">Un autre entretien est planifié pour ce dossier ce jour-là. Vérifie qu’il s’agit d’un rendez-vous distinct.</p>}
        <label className="block text-sm">Source de la date annoncée<textarea className="app-field mt-1" name="sourceDescription" required rows={2} maxLength={2000} placeholder="Ex. invitation reçue par courriel le…" value={draft.sourceDescription} onChange={event => field('sourceDescription', event.target.value)} /></label>
        <p className="text-xs text-muted">Provenance déclarée manuellement ; JobPilot ne vérifie pas l’invitation.</p>
        <label className="block text-sm">Référence de la source (facultative)<input className="app-field mt-1" name="sourceReference" maxLength={2000} value={draft.sourceReference} onChange={event => field('sourceReference', event.target.value)} /></label>
        <label className="block text-sm">Note<textarea className="app-field mt-1" name="note" rows={3} maxLength={10000} value={draft.note} onChange={event => field('note', event.target.value)} /></label>
      </fieldset>
      {error && <p role="alert" className="mt-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      {changedElsewhere && <details className="mt-3 rounded-lg border border-amber-500/40 p-3 text-sm" open><summary>Ce suivi a été modifié ailleurs. Compare avant de confirmer ton brouillon.</summary><p className="mt-2 whitespace-pre-wrap break-words">Dernières valeurs confirmées : {latest.title} · {interviewDateLabel(latest.scheduledDate)} · {INTERVIEW_STATUS_LABELS[latest.status]}{'\n'}Source : {latest.sourceDescription}{latest.sourceReference && `\nRéférence : ${latest.sourceReference}`}{latest.note && `\nNote : ${latest.note}`}</p></details>}
      {persistence.blocked && <div className="mt-3 text-sm"><p>La saisie est conservée. Synchronise, vérifie les données actualisées puis confirme explicitement.</p><button type="button" className="app-button mt-2" disabled={busy || persistence.pending > 0} onClick={() => void synchronize().then(() => setError('')).catch(reason => setError(reason.message))}>Synchroniser sans perdre le brouillon</button></div>}
      <div className="mt-5 flex flex-wrap justify-end gap-3"><button type="button" className="app-button" disabled={busy} onClick={close}>Annuler</button><button className="app-primary" disabled={busy || !persistence.ready || persistence.blocked || !draft.applicationId || !draft.title.trim() || !draft.sourceDescription.trim()}>{busy ? 'Enregistrement…' : 'Confirmer le suivi'}</button></div>
    </form>
  </div>
}
