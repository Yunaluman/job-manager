import { Button } from '../../shared/ui/Button'
import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Plus,
  Search,
  Table2,
  KanbanSquare,
  Pencil,
  Trash2,
  ExternalLink,
  AlarmClock,
  Zap,
  Loader2,
  X,
  ChevronUp,
  ChevronDown,
} from 'lucide-react'
import type { Application, Status } from '../../../shared/contracts/types'
import { STATUSES, STATUS_LABELS } from '../../../shared/contracts/types'
import { useApplications, updateApplication, deleteApplication, isDue } from '../../storage'
import { useSettings, hasApiKey } from '../../cv'
import { parseOffer } from '../../parse'
import { StatusBadge } from '../../components/StatusBadge'
import { ApplicationForm } from './ApplicationForm'
import { useModalFocus } from '../../useModalFocus'
import { firstSendDate } from '../../../shared/domain/application-events.mjs'

type View = 'table' | 'kanban'

function fmt(d?: string) {
  return d ? new Date(d).toLocaleDateString('fr-FR') : '—'
}

export function Applications() {
  const apps = useApplications()
  const [view, setView] = useState<View>('table')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Application | null>(null)
  const [creating, setCreating] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [defaults, setDefaults] = useState<Partial<Application> | undefined>()

  const q = query.toLowerCase()
  const filtered = apps.filter(
    (a) =>
      a.company.toLowerCase().includes(q) ||
      a.title.toLowerCase().includes(q) ||
      (a.location ?? '').toLowerCase().includes(q),
  )

  function remove(a: Application) {
    if (confirm(`Supprimer la candidature ${a.company} — ${a.title} ?`)) {
      void deleteApplication(a.id).catch(() => {})
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="app-eyebrow">Suivi des dossiers</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Candidatures</h1>
          <p className="text-sm text-muted">{apps.length} au total</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 lg:w-auto">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher…"
              aria-label="Rechercher une candidature"
              className="w-full rounded-xl border border-line bg-field py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-muted focus:border-indigo-500 sm:w-56"
            />
          </div>
          <div className="flex rounded-lg border border-line p-0.5">
            {(
              [
                ['table', <Table2 key="t" size={16} />],
                ['kanban', <KanbanSquare key="k" size={16} />],
              ] as [View, React.ReactNode][]
            ).map(([v, icon]) => (
              <Button type="submit"
                key={v}
                aria-label={v === 'table' ? 'Vue tableau' : 'Vue Kanban'}
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`rounded-md px-2.5 py-1.5 transition-colors ${
                  view === v ? 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300' : 'text-muted hover:text-secondary'
                }`}
              >
                {icon}
              </Button>
            ))}
          </div>
          <Button type="submit"
            onClick={() => setQuickOpen(true)}
            className="app-button"
          >
            <Zap size={16} /> Ajout express
          </Button>
          <Button type="submit"
            onClick={() => setCreating(true)}
            className="app-primary"
          >
            <Plus size={16} /> Ajouter
          </Button>
        </div>
      </div>

      {view === 'table' ? (
        <TableView apps={filtered} onEdit={setEditing} onDelete={remove} />
      ) : (
        <KanbanView apps={filtered} onEdit={setEditing} />
      )}

      {(creating || editing) && (
        <ApplicationForm
          initial={editing ?? undefined}
          defaults={defaults}
          onClose={() => {
            setCreating(false)
            setEditing(null)
            setDefaults(undefined)
          }}
        />
      )}

      {quickOpen && (
        <QuickAdd
          onClose={() => setQuickOpen(false)}
          onParsed={(d) => {
            setDefaults(d)
            setQuickOpen(false)
            setCreating(true)
          }}
        />
      )}
    </div>
  )
}

function QuickAdd({
  onClose,
  onParsed,
}: {
  onClose: () => void
  onParsed: (d: Partial<Application>) => void
}) {
  const settings = useSettings()
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const modalRef = useModalFocus(true, () => { if (!loading) onClose() })

  async function run() {
    if (!text.trim()) return
    setLoading(true)
    const parsed = await parseOffer(text, url, settings)
    setLoading(false)
    onParsed({ ...parsed, jobText: text, status: 'a_postuler' })
  }

  const inputClass =
    'app-field'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={modalRef} role="dialog" aria-modal="true" aria-label="Ajout express"
        onClick={(e) => e.stopPropagation()}
        className="app-modal max-w-lg"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Zap size={17} className="text-indigo-700 dark:text-indigo-400" /> Ajout express
          </h2>
          <Button type="submit" aria-label="Fermer l’ajout express" onClick={onClose} className="rounded-lg p-2 text-muted hover:text-ink">
            <X size={18} />
          </Button>
        </div>
        <p className="mb-3 text-xs text-muted">
          Colle le texte de l'offre : entreprise, poste, lieu et salaire seront extraits
          {hasApiKey(settings) ? ` par l'IA (${settings.model})` : ' automatiquement'}, puis tu valides.
        </p>
        <textarea
          className={inputClass}
          rows={9}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Colle ici le texte complet de l'offre (HelloWork, LinkedIn, Indeed…)"
        />
        <input
          type="url"
          className={`${inputClass} mt-3`}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Lien de l'offre (optionnel — détecte aussi la source)"
        />
        <div className="mt-4 flex justify-end gap-3">
          <Button type="submit" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:text-ink">
            Annuler
          </Button>
          <Button type="submit"
            onClick={run}
            disabled={!text.trim() || loading}
            className="app-primary"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
            {loading ? 'Extraction…' : 'Extraire et pré-remplir'}
          </Button>
        </div>
      </div>
    </div>
  )
}

type SortKey = 'company' | 'title' | 'status' | 'appliedAt' | 'nextActionAt' | 'source'

// L'ordre des statuts suit la progression du pipeline, pas l'alphabet
const STATUS_ORDER: Record<Status, number> = {
  a_postuler: 0,
  postulee: 1,
  relancee: 2,
  entretien: 3,
  offre: 4,
  refusee: 5,
}

function TableView({
  apps,
  onEdit,
  onDelete,
}: {
  apps: Application[]
  onEdit: (a: Application) => void
  onDelete: (a: Application) => void
}) {
  const navigate = useNavigate()
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortAsc, setSortAsc] = useState(true)

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      if (sortAsc) setSortAsc(false)
      else setSortKey(null) // 3e clic : retour à l'ordre par défaut
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  const sorted = sortKey
    ? [...apps].sort((a, b) => {
        const cmp =
          sortKey === 'status'
            ? STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
            : sortKey === 'appliedAt'
              ? (firstSendDate(a) ?? '').localeCompare(firstSendDate(b) ?? '')
              : (a[sortKey] ?? '').localeCompare(b[sortKey] ?? '', 'fr')
        return sortAsc ? cmp : -cmp
      })
    : apps

  function Th({ label, k }: { label: string; k: SortKey }) {
    return (
      <th className="px-4 py-3">
        <Button type="submit"
          onClick={() => toggleSort(k)}
          className="flex items-center gap-1 uppercase tracking-wide hover:text-secondary"
        >
          {label}
          {sortKey === k &&
            (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
        </Button>
      </th>
    )
  }

  if (apps.length === 0)
    return (
      <div className="rounded-2xl border border-dashed border-line py-16 text-center text-sm text-muted">
        Aucune candidature. Clique sur « Ajouter » pour commencer.
      </div>
    )
  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-surface text-left text-xs text-muted">
            <Th label="Entreprise" k="company" />
            <Th label="Poste" k="title" />
            <Th label="Statut" k="status" />
            <Th label="Postulée le" k="appliedAt" />
            <Th label="Relance" k="nextActionAt" />
            <Th label="Source" k="source" />
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sorted.map((a) => (
            <tr
              key={a.id}
              onClick={() => void navigate({ to: '/candidatures/$id', params: { id: a.id } })}
              className="group cursor-pointer bg-surface hover:bg-subtle"
            >
              <td className="px-4 py-3 font-medium">
                <span className="flex items-center gap-1.5">
                  {a.company}
                  {a.url && (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-muted hover:text-indigo-700 dark:text-indigo-400"
                    >
                      <ExternalLink size={13} />
                    </a>
                  )}
                </span>
              </td>
              <td className="px-4 py-3 text-secondary">{a.title}</td>
              <td className="px-4 py-3">
                <StatusBadge status={a.status} application={a} />
              </td>
              <td className="px-4 py-3 text-muted">{fmt(firstSendDate(a))}</td>
              <td className="px-4 py-3">
                <span className={`flex items-center gap-1.5 ${isDue(a) ? 'text-amber-700 dark:text-amber-400' : 'text-muted'}`}>
                  {isDue(a) && <AlarmClock size={13} />}
                  {fmt(a.nextActionAt)}
                </span>
              </td>
              <td className="px-4 py-3 text-muted">{a.source || '—'}</td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <Button type="submit"
                    aria-label={`Modifier ${a.company}`}
                    disabled={Boolean(a.register)}
                    onClick={(e) => {
                      e.stopPropagation()
                      onEdit(a)
                    }}
                    className="rounded-md p-1.5 text-muted hover:bg-subtle hover:text-ink"
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button type="submit"
                    aria-label={`Supprimer ${a.company}`}
                    disabled={Boolean(a.register)}
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(a)
                    }}
                    className="rounded-md p-1.5 text-muted hover:bg-rose-500/20 hover:text-rose-700 dark:text-rose-300"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function KanbanView({
  apps,
  onEdit,
}: {
  apps: Application[]
  onEdit: (a: Application) => void
}) {
  const navigate = useNavigate()
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<Status | 'archived' | 'excluded' | null>(null)

  function drop(status: Status | 'archived' | 'excluded') {
    if (dragId && status !== 'archived' && status !== 'excluded') void updateApplication(dragId, { status }).catch(() => {})
    setDragId(null)
    setOverCol(null)
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {([...STATUSES, 'archived', 'excluded'] as const).map((status) => {
        const col = apps.filter((a) => status === 'archived' || status === 'excluded'
          ? a.register?.disposition === status
          : a.status === status && (!a.register || a.register.disposition === 'active'))
        return (
          <div
            key={status}
            onDragOver={(e) => {
              e.preventDefault()
              setOverCol(status)
            }}
            onDragLeave={() => setOverCol(null)}
            onDrop={() => drop(status)}
            className={`flex min-h-40 flex-col rounded-xl border p-2 transition-colors ${
              overCol === status ? 'border-indigo-500 bg-indigo-500/5' : 'border-line bg-surface'
            }`}
          >
            <div className="mb-2 flex items-center justify-between px-1.5 pt-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                {status === 'archived' ? 'Abandonnées (CSV)' : status === 'excluded' ? 'Écartées (CSV)' : STATUS_LABELS[status]}
              </span>
              <span className="text-xs text-muted">{col.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {col.map((a) => (
                <div
                  key={a.id}
                  draggable={!a.register}
                  onDragStart={() => { if (!a.register) setDragId(a.id) }}
                  onClick={() => a.register ? void navigate({ to: '/candidatures/$id', params: { id: a.id } }) : onEdit(a)}
                  role="button" tabIndex={0} aria-label={`${a.company} — ${a.title}`}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (a.register) void navigate({ to: '/candidatures/$id', params: { id: a.id } }); else onEdit(a) } }}
                  className={`${a.register ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'} rounded-lg border border-line bg-subtle p-2.5 text-sm shadow hover:border-slate-600`}
                >
                  <div className="font-medium leading-tight">{a.company}</div>
                  <div className="mt-0.5 text-xs leading-tight text-muted">{a.title}</div>
                  {a.register && <div className="mt-2"><StatusBadge status={a.status} application={a} /><span className="ml-2 text-xs text-muted">CSV · lecture seule</span></div>}
                  {isDue(a) && (
                    <div className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                      <AlarmClock size={11} /> Relance due
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
