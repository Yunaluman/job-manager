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
import type { Application, Status } from '../types'
import { STATUSES, STATUS_LABELS } from '../types'
import { useApplications, updateApplication, deleteApplication, isDue } from '../storage'
import { useSettings, activeKey } from '../cv'
import { parseOffer } from '../parse'
import { StatusBadge } from '../components/StatusBadge'
import { ApplicationForm } from '../components/ApplicationForm'

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
      deleteApplication(a.id)
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Candidatures</h1>
          <p className="text-sm text-slate-400">{apps.length} au total</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher…"
              className="w-56 rounded-lg border border-slate-700 bg-slate-800/60 py-2 pl-9 pr-3 text-sm outline-none placeholder:text-slate-500 focus:border-indigo-500"
            />
          </div>
          <div className="flex rounded-lg border border-slate-700 p-0.5">
            {(
              [
                ['table', <Table2 key="t" size={16} />],
                ['kanban', <KanbanSquare key="k" size={16} />],
              ] as [View, React.ReactNode][]
            ).map(([v, icon]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-2.5 py-1.5 transition-colors ${
                  view === v ? 'bg-indigo-500/20 text-indigo-300' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {icon}
              </button>
            ))}
          </div>
          <button
            onClick={() => setQuickOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-indigo-500/40 px-4 py-2 text-sm font-medium text-indigo-300 hover:bg-indigo-500/10"
          >
            <Zap size={16} /> Ajout express
          </button>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium shadow-lg shadow-indigo-500/25 hover:bg-indigo-400"
          >
            <Plus size={16} /> Ajouter
          </button>
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

  async function run() {
    if (!text.trim()) return
    setLoading(true)
    const parsed = await parseOffer(text, url, settings)
    setLoading(false)
    onParsed({ ...parsed, jobText: text, status: 'a_postuler' })
  }

  const inputClass =
    'w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm outline-none placeholder:text-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Zap size={17} className="text-indigo-400" /> Ajout express
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200">
            <X size={18} />
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-400">
          Colle le texte de l'offre : entreprise, poste, lieu et salaire seront extraits
          {activeKey(settings) ? ` par l'IA (${settings.model})` : ' automatiquement'}, puis tu valides.
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
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-slate-100">
            Annuler
          </button>
          <button
            onClick={run}
            disabled={!text.trim() || loading}
            className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium shadow-lg shadow-indigo-500/25 hover:bg-indigo-400 disabled:opacity-50"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
            {loading ? 'Extraction…' : 'Extraire et pré-remplir'}
          </button>
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
            : (a[sortKey] ?? '').localeCompare(b[sortKey] ?? '', 'fr')
        return sortAsc ? cmp : -cmp
      })
    : apps

  function Th({ label, k }: { label: string; k: SortKey }) {
    return (
      <th className="px-4 py-3">
        <button
          onClick={() => toggleSort(k)}
          className="flex items-center gap-1 uppercase tracking-wide hover:text-slate-300"
        >
          {label}
          {sortKey === k &&
            (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
        </button>
      </th>
    )
  }

  if (apps.length === 0)
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 py-16 text-center text-sm text-slate-500">
        Aucune candidature. Clique sur « Ajouter » pour commencer.
      </div>
    )
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-900/80 text-left text-xs text-slate-500">
            <Th label="Entreprise" k="company" />
            <Th label="Poste" k="title" />
            <Th label="Statut" k="status" />
            <Th label="Postulée le" k="appliedAt" />
            <Th label="Relance" k="nextActionAt" />
            <Th label="Source" k="source" />
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/70">
          {sorted.map((a) => (
            <tr
              key={a.id}
              onClick={() => void navigate({ to: '/candidatures/$id', params: { id: a.id } })}
              className="group cursor-pointer bg-slate-900/40 hover:bg-slate-800/40"
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
                      className="text-slate-500 hover:text-indigo-400"
                    >
                      <ExternalLink size={13} />
                    </a>
                  )}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-300">{a.title}</td>
              <td className="px-4 py-3">
                <StatusBadge status={a.status} />
              </td>
              <td className="px-4 py-3 text-slate-400">{fmt(a.appliedAt)}</td>
              <td className="px-4 py-3">
                <span className={`flex items-center gap-1.5 ${isDue(a) ? 'text-amber-400' : 'text-slate-400'}`}>
                  {isDue(a) && <AlarmClock size={13} />}
                  {fmt(a.nextActionAt)}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-400">{a.source || '—'}</td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onEdit(a)
                    }}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-700 hover:text-slate-100"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(a)
                    }}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300"
                  >
                    <Trash2 size={14} />
                  </button>
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
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<Status | null>(null)

  function drop(status: Status) {
    if (dragId) updateApplication(dragId, { status })
    setDragId(null)
    setOverCol(null)
  }

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
      {STATUSES.map((status) => {
        const col = apps.filter((a) => a.status === status)
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
              overCol === status ? 'border-indigo-500 bg-indigo-500/5' : 'border-slate-800 bg-slate-900/40'
            }`}
          >
            <div className="mb-2 flex items-center justify-between px-1.5 pt-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {STATUS_LABELS[status]}
              </span>
              <span className="text-xs text-slate-600">{col.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {col.map((a) => (
                <div
                  key={a.id}
                  draggable
                  onDragStart={() => setDragId(a.id)}
                  onClick={() => onEdit(a)}
                  className="cursor-grab rounded-lg border border-slate-800 bg-slate-800/60 p-2.5 text-sm shadow hover:border-slate-600 active:cursor-grabbing"
                >
                  <div className="font-medium leading-tight">{a.company}</div>
                  <div className="mt-0.5 text-xs leading-tight text-slate-400">{a.title}</div>
                  {isDue(a) && (
                    <div className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-400">
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
