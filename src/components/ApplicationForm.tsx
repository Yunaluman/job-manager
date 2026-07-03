import { useState } from 'react'
import { X } from 'lucide-react'
import type { Application, Status } from '../types'
import { STATUSES, STATUS_LABELS } from '../types'
import { addApplication, updateApplication } from '../storage'

interface Props {
  initial?: Application
  onClose: () => void
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const RELANCE_DAYS = 7

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm outline-none placeholder:text-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-400">
      {label}
      {children}
    </label>
  )
}

export function ApplicationForm({ initial, onClose }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  // La relance est proposée à J+7 tant que l'utilisateur ne l'a pas modifiée à la main
  const [relanceDirty, setRelanceDirty] = useState(Boolean(initial))
  const [form, setForm] = useState({
    company: initial?.company ?? '',
    title: initial?.title ?? '',
    url: initial?.url ?? '',
    location: initial?.location ?? '',
    source: initial?.source ?? '',
    contact: initial?.contact ?? '',
    salary: initial?.salary ?? '',
    status: initial?.status ?? ('postulee' as Status),
    appliedAt: initial?.appliedAt?.slice(0, 10) ?? today,
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

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.company.trim() || !form.title.trim()) return
    const data = {
      ...form,
      status: form.status as Status,
      appliedAt: form.appliedAt || undefined,
      nextActionAt: form.nextActionAt || undefined,
    }
    if (initial) updateApplication(initial.id, data)
    else addApplication(data)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {initial ? 'Modifier la candidature' : 'Nouvelle candidature'}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-200">
            <X size={18} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4">
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
            <input type="date" className={inputClass} value={form.appliedAt} onChange={set('appliedAt')} />
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
          <div className="col-span-2">
            <Field label="Lien de l'offre">
              <input type="url" className={inputClass} value={form.url} onChange={set('url')} placeholder="https://…" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Contact (recruteur, email…)">
              <input className={inputClass} value={form.contact} onChange={set('contact')} />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Notes">
              <textarea className={inputClass} rows={3} value={form.notes} onChange={set('notes')} />
            </Field>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-slate-100">
            Annuler
          </button>
          <button
            type="submit"
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium shadow-lg shadow-indigo-500/25 hover:bg-indigo-400"
          >
            {initial ? 'Enregistrer' : 'Ajouter'}
          </button>
        </div>
      </form>
    </div>
  )
}
