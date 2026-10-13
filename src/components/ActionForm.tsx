import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useData, usePersistenceStatus, synchronize } from '../data'
import type { ActionInput } from '../action-types'
import { KIND_LABELS, PRIORITY_LABELS, STATUS_LABELS, saveAction } from '../actions'
import { DraftGuard } from './DraftGuard'
import { useModalFocus } from '../useModalFocus'

export function ActionForm({ initial, onClose }: { initial: ActionInput; onClose: () => void }) {
  const { applications, interviewPlans } = useData()
  const persistence = usePersistenceStatus()
  const [draft, setDraft] = useState(initial)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [error, setError] = useState('')
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const close = () => { if (!inFlight.current && (!dirty || window.confirm('Abandonner les modifications de cette action ?'))) onClose() }
  const modal = useModalFocus<HTMLFormElement>(true, close)
  const missing = draft.applicationId && !applications.some((app) => app.id === draft.applicationId)
  const field = (key: keyof ActionInput, value: string) => setDraft((previous) => ({ ...previous, [key]: value }))
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3 sm:p-6">
    <DraftGuard dirty={dirty} />
    <form ref={modal} role="dialog" aria-modal="true" aria-label="Préparer une action" className="app-modal max-h-[90vh] w-full max-w-xl overflow-y-auto" onSubmit={(event) => {
      event.preventDefault()
      if (inFlight.current) return
      inFlight.current = true; setBusy(true); setError('')
      void saveAction(draft).then(onClose).catch((reason) => setError(reason instanceof Error ? reason.message : 'Écriture non confirmée. Le brouillon est conservé.'))
        .finally(() => { inFlight.current = false; setBusy(false) })
    }}>
      <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Préparer une action</h2><button type="button" className="app-button" aria-label="Fermer le formulaire d’action" disabled={busy} onClick={close}><X size={18} /></button></div>
      <p className="mb-4 text-sm text-muted">Terminer une action ne prouve pas un envoi et ne modifie pas le registre.</p>
      <fieldset disabled={busy} className="space-y-3">
        <label className="block text-sm">Titre<input className="app-field mt-1" required maxLength={300} value={draft.title} onChange={(e) => field('title', e.target.value)} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">Type<select className="app-field mt-1" value={draft.kind} onChange={(e) => setDraft(previous => ({ ...previous, kind: e.target.value as ActionInput['kind'], interviewPlan: e.target.value === 'prepare-interview' ? previous.interviewPlan : undefined }))}>{Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="block text-sm">Priorité<select className="app-field mt-1" value={draft.priority} onChange={(e) => field('priority', e.target.value)}>{Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="block text-sm">Échéance (Europe/Paris)<input className="app-field mt-1" type="date" value={draft.dueDate ?? ''} onChange={(e) => setDraft((previous) => ({ ...previous, dueDate: e.target.value || undefined }))} /></label>
          <label className="block text-sm">État<select className="app-field mt-1" value={draft.status} onChange={(e) => field('status', e.target.value)}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <label className="block text-sm">Dossier lié<select className="app-field mt-1" value={draft.applicationId ?? ''} onChange={(e) => setDraft((previous) => ({ ...previous, applicationId: e.target.value || undefined, source: e.target.value === previous.applicationId ? previous.source : undefined, interviewPlan: e.target.value === previous.applicationId ? previous.interviewPlan : undefined }))}>
          <option value="">Action générale</option>{missing && <option value={draft.applicationId}>Dossier supprimé — lien historique</option>}
          {applications.map((app) => <option key={app.id} value={app.id}>{app.company} — {app.title}{app.register ? ' (CSV)' : ''}</option>)}
        </select></label>
        {draft.source && <p className="text-xs text-muted">Issue de la relance source du {draft.source.dueDate}. Reporter cette action ne change pas cette date source.</p>}
        {draft.interviewPlan && <div className="text-xs text-muted"><p>Préparation liée à l’entretien annoncé pour le {draft.interviewPlan.scheduledDate}. Terminer la préparation ne clôt pas le suivi d’entretien.</p>{interviewPlans.find(plan => plan.id === draft.interviewPlan?.id)?.scheduledDate !== draft.interviewPlan.scheduledDate && <p className="text-amber-700 dark:text-amber-300">La date annoncée a changé. Vérifie explicitement l’échéance de cette préparation.</p>}<button type="button" className="app-button mt-2" onClick={() => setDraft(previous => ({ ...previous, interviewPlan: undefined }))}>Détacher de l’entretien</button></div>}
        <label className="block text-sm">Note de préparation<textarea className="app-field mt-1" rows={3} maxLength={10000} value={draft.note} onChange={(e) => field('note', e.target.value)} /></label>
        <label className="block text-sm">Note de résultat (facultative)<textarea className="app-field mt-1" rows={2} maxLength={10000} value={draft.resultNote} onChange={(e) => field('resultNote', e.target.value)} /></label>
      </fieldset>
      {error && <p role="alert" className="mt-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      {persistence.blocked && <div className="mt-3 text-sm"><p>Le brouillon est conservé. Synchronise, puis vérifie tes modifications avant de confirmer.</p><button type="button" className="app-button mt-2" disabled={busy || persistence.pending > 0} onClick={() => void synchronize().catch((reason) => setError(reason.message))}>Synchroniser sans perdre le brouillon</button></div>}
      <div className="mt-5 flex flex-wrap justify-end gap-3"><button type="button" className="app-button" disabled={busy} onClick={close}>Annuler</button><button className="app-primary" disabled={busy || persistence.blocked || !persistence.ready || !draft.title.trim()}>{busy ? 'Enregistrement…' : 'Confirmer l’action'}</button></div>
    </form>
  </div>
}
