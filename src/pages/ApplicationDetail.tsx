import { useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import {
  ArrowLeft,
  Pencil,
  Trash2,
  ExternalLink,
  MapPin,
  Banknote,
  User,
  Globe,
  CalendarDays,
  AlarmClock,
  History,
  Sparkles,
  Mail,
  ChevronRight,
} from 'lucide-react'
import { useApplications, updateApplication, deleteApplication, isDue } from '../storage'
import { firstSendDate } from '../application-events.mjs'
import { ApplicationTimeline } from '../components/ApplicationTimeline'
import type { Status } from '../types'
import { STATUSES, STATUS_LABELS } from '../types'
import { StatusBadge } from '../components/StatusBadge'
import { ApplicationForm } from '../components/ApplicationForm'
import { DocumentsPanel } from '../components/DocumentsPanel'
import { CvDocumentsPanel } from '../components/CvDocumentsPanel'

function fmt(d?: string) {
  return d ? new Date(d).toLocaleDateString('fr-FR') : '—'
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string }) {
  if (!value) return null
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <span className="text-muted">{icon}</span>
      <span className="text-muted">{label}</span>
      <span className="ml-auto font-medium text-ink">{value}</span>
    </div>
  )
}

export function ApplicationDetail() {
  const { id } = useParams({ strict: false }) as { id: string }
  const apps = useApplications()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const app = apps.find((a) => a.id === id)

  if (!app)
    return (
      <div className="mx-auto max-w-3xl pt-16 text-center text-sm text-muted">
        Candidature introuvable.{' '}
        <Link to="/candidatures" className="text-indigo-700 dark:text-indigo-400 hover:underline">
          Retour à la liste
        </Link>
      </div>
    )

  async function remove() {
    if (!app) return
    if (confirm(`Supprimer la candidature ${app.company} — ${app.title} ?`)) {
      try { await deleteApplication(app.id); await navigate({ to: '/candidatures' }) }
      catch { /* The shared persistence banner keeps the failure visible. */ }
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to="/candidatures"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
      >
        <ArrowLeft size={15} /> Candidatures
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            {app.company}
            {app.url && (
              <a href={app.url} target="_blank" rel="noreferrer" className="text-muted hover:text-indigo-700 dark:text-indigo-400">
                <ExternalLink size={17} />
              </a>
            )}
          </h1>
          <p className="mt-0.5 text-muted">{app.title}</p>
        </div>
        <div className="flex items-center gap-2">
          {app.register ? <StatusBadge status={app.status} application={app} /> : <select
            aria-label="Statut de la candidature"
            value={app.status}
            onChange={(e) => void updateApplication(app.id, { status: e.target.value as Status }).catch(() => {})}
            className="rounded-lg border border-line bg-subtle px-3 py-2 text-sm outline-none focus:border-indigo-500"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>}
          <button
            aria-label="Modifier la candidature"
            disabled={Boolean(app.register)}
            onClick={() => setEditing(true)}
            className="rounded-lg border border-line p-2.5 text-secondary hover:border-slate-500"
          >
            <Pencil size={15} />
          </button>
          <button
            aria-label="Supprimer la candidature"
            disabled={Boolean(app.register)}
            onClick={remove}
            className="rounded-lg border border-line p-2.5 text-secondary hover:border-rose-500/60 hover:text-rose-700 dark:text-rose-300"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {app.register && <section className="app-panel mb-6 p-5 text-sm">
        <h2 className="mb-2 font-semibold">Registre CSV — consultation uniquement</h2>
        <p className="text-muted">Copie de {app.register.sourceName} · identifiant {app.register.externalId} · importée le {new Date(app.register.importedAt).toLocaleString('fr-FR')}. Modifie le CSV puis importe son aperçu pour actualiser ce dossier.</p>
        <p className="mt-2 break-all text-xs text-muted">SHA-256 du fichier importé : {app.register.fileSha256}</p>
        <details className="mt-3"><summary className="cursor-pointer">Cellules sources, vérifications et chemins CV / lettre</summary><dl className="mt-3 space-y-2 break-words">{Object.entries(app.register.raw).map(([key, value]) => <div key={key}><dt className="font-medium">{key}</dt><dd className="whitespace-pre-wrap text-muted">{value || '—'}</dd></div>)}</dl></details>
      </section>}

      {/* Parcours candidature : offre → analyse CV → lettre → candidature */}
      <div className="mb-6 flex flex-wrap items-center gap-2 app-panel p-4 text-sm">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted">
          Parcours
        </span>
        <Link
          to="/cv"
          search={{ app: app.id }}
          className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-ink hover:border-indigo-500/60 hover:text-indigo-700 dark:text-indigo-300"
        >
          <Sparkles size={14} /> Analyser mon CV face à l'offre
        </Link>
        <ChevronRight size={14} className="text-muted" />
        <Link
          to="/lettre"
          search={{ app: app.id }}
          className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-ink hover:border-indigo-500/60 hover:text-indigo-700 dark:text-indigo-300"
        >
          <Mail size={14} /> Rédiger la lettre
        </Link>
        <ChevronRight size={14} className="text-muted" />
        <span className="text-muted">{app.register ? 'Après un envoi réel, actualise le registre CSV.' : 'Postuler puis passer le statut à « Postulée »'}</span>
        {!app.jobText && (
          <span className="w-full pt-1 text-xs text-amber-700 dark:text-amber-400/90">
            {app.register ? 'Colle le texte de l’offre directement dans l’analyse CV ou la lettre.' : 'Astuce : colle le texte de l’offre (bouton crayon) pour pré-remplir l’analyse et la lettre.'}
          </span>
        )}
      </div>

      <ApplicationTimeline key={app.id} application={app} />
      <DocumentsPanel key={`documents-${app.id}`} application={app} />
      <CvDocumentsPanel key={`cv-${app.id}`} applicationId={app.id} />

      <div className="grid gap-6 md:grid-cols-2">
        <section className="flex flex-col gap-3 app-panel p-5">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Informations</h2>
            <StatusBadge status={app.status} application={app} />
          </div>
          <Info icon={<CalendarDays size={14} />} label="Premier envoi documenté" value={fmt(firstSendDate(app))} />
          <div className="flex items-center gap-2.5 text-sm">
            <span className="text-muted">
              <AlarmClock size={14} />
            </span>
            <span className="text-muted">Relance</span>
            <span className={`ml-auto font-medium ${isDue(app) ? 'text-amber-700 dark:text-amber-400' : 'text-ink'}`}>
              {fmt(app.nextActionAt)}
              {isDue(app) && ' — due !'}
            </span>
          </div>
          <Info icon={<MapPin size={14} />} label="Lieu" value={app.location} />
          <Info icon={<Globe size={14} />} label="Source" value={app.source} />
          <Info icon={<Banknote size={14} />} label="Salaire" value={app.salary} />
          <Info icon={<User size={14} />} label="Contact" value={app.contact} />
          {app.notes && (
            <div className="mt-2 border-t border-line pt-3">
              <div className="mb-1 text-xs font-medium text-muted">Notes</div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-secondary">{app.notes}</p>
            </div>
          )}
        </section>

        <section className="app-panel p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <History size={14} className="text-muted" /> Historique
          </h2>
          <ol className="relative ml-2 border-l border-line pl-5">
            {[...app.history].reverse().map((h, i) => (
              <li key={i} className="relative mb-4 last:mb-0">
                <span
                  className={`absolute -left-[26.5px] top-1 h-2.5 w-2.5 rounded-full border-2 border-slate-900 ${
                    i === 0 ? 'bg-indigo-400' : 'bg-slate-600'
                  }`}
                />
                <div className="text-sm text-ink">{h.event}</div>
                <div className="text-xs text-muted">
                  {new Date(h.date).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {editing && <ApplicationForm initial={app} onClose={() => setEditing(false)} />}
    </div>
  )
}
