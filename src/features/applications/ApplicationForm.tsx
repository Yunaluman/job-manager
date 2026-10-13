import { Button } from '../../shared/ui/Button'
import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { Application, Status } from '../../../shared/contracts/types'
import { STATUSES, STATUS_LABELS } from '../../../shared/contracts/types'
import { addApplication, updateApplication } from '../../storage'
import { useModalFocus } from '../../useModalFocus'
import { firstSendDate } from '../../../shared/domain/application-events.mjs'

interface Props {
  initial?: Application
  // Pré-remplissage à la création (ajout express) — ignoré en édition
  defaults?: Partial<Application>
  onClose: () => void
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const RELANCE_DAYS = 7

const inputClass =
  'app-field'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
      {label}
      {children}
    </label>
  )
}

export function ApplicationForm({ initial, defaults, onClose }: Props) {
  const submitting = useRef(false)
  const modalRef = useModalFocus<HTMLFormElement>(true, () => { if (!submitting.current) onClose() })
  const today = new Date().toISOString().slice(0, 10)
  // La relance est proposée à J+7 tant que l'utilisateur ne l'a pas modifiée à la main
  const [relanceDirty, setRelanceDirty] = useState(Boolean(initial))
  const [form, setForm] = useState({
    company: initial?.company ?? defaults?.company ?? '',
    title: initial?.title ?? defaults?.title ?? '',
    url: initial?.url ?? defaults?.url ?? '',
    location: initial?.location ?? defaults?.location ?? '',
    source: initial?.source ?? defaults?.source ?? '',
    contact: initial?.contact ?? '',
    salary: initial?.salary ?? defaults?.salary ?? '',
    status: initial?.status ?? defaults?.status ?? ('postulee' as Status),
    jobText: initial?.jobText ?? defaults?.jobText ?? '',
    appliedAt: initial ? firstSendDate(initial) ?? '' : '',
    nextActionAt: initial?.nextActionAt?.slice(0, 10) ?? addDays(today, RELANCE_DAYS),
    notes: initial?.notes ?? '',
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = e.target.value
    if (k === 'nextActionAt') setRelanceDirty(true)
    setForm((f) => ({
      ...f,
      [k]: value,
      // la relance suit la date de candidature tant qu'elle n'a pas été éditée à la main
      ...(k === 'appliedAt' && !relanceDirty && value
        ? { nextActionAt: addDays(value, RELANCE_DAYS) }
        : {}),
    }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting.current) return
    if (!form.company.trim() || !form.title.trim()) return
    const data = {
      ...form,
      status: form.status as Status,
      appliedAt: form.appliedAt || undefined,
      nextActionAt: form.nextActionAt || undefined,
    }
    submitting.current = true
    try {
      if (initial) await updateApplication(initial.id, data)
      else await addApplication(data)
      onClose()
    } catch (error) { alert(error instanceof Error ? error.message : 'Enregistrement non confirmé. La saisie est conservée.') }
    finally { submitting.current = false }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <form
        ref={modalRef} role="dialog" aria-modal="true" aria-label={initial ? 'Modifier la candidature' : 'Nouvelle candidature'}
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="app-modal max-w-lg"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {initial ? 'Modifier la candidature' : 'Nouvelle candidature'}
          </h2>
          <Button type="button" aria-label="Fermer le formulaire" onClick={onClose} className="rounded-lg p-2 text-muted hover:text-ink">
            <X size={18} />
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Entreprise *">
            <input className={inputClass} value={form.company} onChange={set('company')} autoFocus required />
          </Field>
          <Field label="Poste *">
            <input className={inputClass} value={form.title} onChange={set('title')} required />
          </Field>
          <Field label="Statut">
            <select className={inputClass} value={form.status} onChange={set('status')}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Source (LinkedIn, Indeed…)">
            <input className={inputClass} value={form.source} onChange={set('source')} />
          </Field>
          <Field label="Date de candidature">
            <input type="date" className={inputClass} value={form.appliedAt} onChange={set('appliedAt')} disabled={initial?.events?.some((event) => event.kind === 'sent')} />
            {initial?.events?.some((event) => event.kind === 'sent') && <span>Modifie les dates dans « Étapes documentées ».</span>}
          </Field>
          <Field label={relanceDirty ? 'Prochaine action / relance' : 'Relance (proposée à J+7)'}>
            <input type="date" className={inputClass} value={form.nextActionAt} onChange={set('nextActionAt')} />
          </Field>
          <Field label="Lieu">
            <input className={inputClass} value={form.location} onChange={set('location')} />
          </Field>
          <Field label="Salaire">
            <input className={inputClass} value={form.salary} onChange={set('salary')} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Lien de l'offre">
              <input type="url" className={inputClass} value={form.url} onChange={set('url')} placeholder="https://…" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Contact (recruteur, email…)">
              <input className={inputClass} value={form.contact} onChange={set('contact')} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Texte de l'offre (réutilisé par l'analyse CV et la lettre)">
              <textarea className={inputClass} rows={3} value={form.jobText} onChange={set('jobText')} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <textarea className={inputClass} rows={3} value={form.notes} onChange={set('notes')} />
            </Field>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:text-ink">
            Annuler
          </Button>
          <Button
            type="submit"
            className="app-primary"
          >
            {initial ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </div>
      </form>
    </div>
  )
}
