import { useRef, useState } from 'react'
import type { Application, ApplicationEvent } from '../types'
import { applicationEvents } from '../application-events.mjs'
import { recordApplicationEvent, removeApplicationEvent, updateApplication } from '../storage'
import { useAnalyses } from '../cv'
import { DraftGuard } from './DraftGuard'
import { useModalFocus } from '../useModalFocus'

const labels: Record<ApplicationEvent['kind'], string> = {
  sent: 'Envoi', response: 'Réponse', interview: 'Entretien', offer: 'Offre', refusal: 'Refus',
}
const fmt = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR')

export function ApplicationTimeline({ application: app }: { application: Application }) {
  const [kind, setKind] = useState<ApplicationEvent['kind']>('sent')
  const [date, setDate] = useState('')
  const [editingId, setEditingId] = useState<string>()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmation, setConfirmation] = useState<{ message: string; accept: () => void } | null>(null)
  const confirmationRef = useModalFocus<HTMLDivElement>(Boolean(confirmation), () => setConfirmation(null))
  const inFlight = useRef(false)
  const analyses = useAnalyses().filter((analysis) => analysis.applicationId === app.id)
  const events = [...applicationEvents(app)].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  function reset() { setDate(''); setEditingId(undefined) }
  async function write(action: () => Promise<unknown>) {
    if (inFlight.current) return
    inFlight.current = true; setSaving(true); setError('')
    try { await action() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Écriture non confirmée. La saisie est conservée.') }
    finally { inFlight.current = false; setSaving(false) }
  }
  return <section className="app-panel mb-6 p-5">
    <DraftGuard dirty={Boolean(date)} />
    <h2 className="mb-3 font-semibold">Étapes documentées</h2>
    <p className="mb-3 text-sm text-muted">{app.register ? 'Dates issues des colonnes explicites du CSV. Pour les corriger, modifie le registre puis réimporte son aperçu.' : 'Le statut ne prouve pas un envoi. Renseigne la date réelle de chaque étape.'}</p>
    {app.eventHistoryComplete !== true && <p className="mb-3 text-sm text-amber-700 dark:text-amber-300">Historique incomplet : les étapes manquantes restent inconnues.</p>}
    {!events.length && <p className="mb-4 text-sm text-muted">Aucune étape datée renseignée.</p>}
    <ul className="mb-4 space-y-2 text-sm">{events.map((event) => <li className="flex flex-wrap items-center gap-2" key={event.id}>
      <span>{labels[event.kind]} — {fmt(event.occurredAt)}</span>
      {event.source === 'legacy-date' && <span className="text-muted">(date déjà renseignée{app.register && ' · archive locale'})</span>}
      {event.source === 'manual' && app.register && <span className="text-muted">(archive locale datée)</span>}
      {event.source === 'register-date' && <span className="text-muted">(date du registre)</span>}
      {!app.register && <>
      <button className="app-button" disabled={saving} aria-label={`Corriger ${labels[event.kind]} du ${event.occurredAt}`} onClick={() => {
        const select = () => { setEditingId(event.id); setKind(event.kind); setDate(event.occurredAt) }
        if (date) setConfirmation({ message: 'Abandonner la saisie en cours pour corriger cette étape ?', accept: select })
        else select()
      }}>Corriger</button>
      <button className="app-button" disabled={saving} aria-label={`Supprimer ${labels[event.kind]} du ${event.occurredAt}`} onClick={() => {
        setConfirmation({ message: 'Supprimer cette étape documentée ? Le statut restera inchangé.',
          accept: () => void write(async () => { await removeApplicationEvent(app.id, event.id); if (editingId === event.id) reset() }) })
      }}>Supprimer</button>
      </>}
    </li>)}</ul>
    {!app.register && <><form className="flex flex-wrap gap-3" onSubmit={(e) => {
      e.preventDefault()
      void write(async () => { await recordApplicationEvent(app.id, kind, date, editingId); reset() })
    }}>
      <select aria-label="Étape" className="app-field w-auto" value={kind} disabled={saving} onChange={(e) => setKind(e.target.value as ApplicationEvent['kind'])}>
        {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <input aria-label="Date réelle de l’étape" className="app-field w-auto" type="date" required value={date} disabled={saving} onChange={(e) => setDate(e.target.value)} />
      <button className="app-button" disabled={saving}>{editingId ? 'Confirmer la correction' : 'Enregistrer l’étape'}</button>
      {editingId && <button type="button" className="app-button" disabled={saving} onClick={reset}>Annuler la correction</button>}
    </form>
    {error && <p role="alert" className="mt-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
    <label className="mt-4 flex gap-2 text-sm"><input type="checkbox" checked={app.eventHistoryComplete === true} disabled={saving} onChange={(e) => {
      const complete = e.target.checked
      const save = () => void write(() => updateApplication(app.id, { eventHistoryComplete: complete }))
      if (complete) setConfirmation({ message: 'Confirmer que toutes les étapes connues de ce dossier sont renseignées ?', accept: save })
      else save()
    }} />Toutes les étapes connues sont renseignées</label></>}
    <h3 className="mt-5 mb-2 font-semibold">Analyses et lettres liées ({analyses.length})</h3>
    {!analyses.length && <p className="text-sm text-muted">Aucune analyse ou lettre liée à ce dossier.</p>}
    {analyses.map((analysis) => <details key={analysis.id} className="mb-2"><summary className="cursor-pointer text-sm">{analysis.kind === 'lettre' ? 'Lettre' : 'Analyse CV'} — {fmt(analysis.date)}</summary><p className="mt-2 whitespace-pre-wrap break-words text-sm">{analysis.result}</p></details>)}
    {confirmation && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4">
      <div ref={confirmationRef} role="dialog" aria-modal="true" aria-label="Confirmer la modification des étapes" className="app-modal max-w-md">
        <p>{confirmation.message}</p>
        <div className="mt-4 flex justify-end gap-3">
          <button className="app-button" onClick={() => setConfirmation(null)}>Annuler</button>
          <button className="app-button" onClick={() => { const accept = confirmation.accept; setConfirmation(null); accept() }}>Confirmer</button>
        </div>
      </div>
    </div>}
  </section>
}
