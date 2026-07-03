import { useState } from 'react'
import {
  Plus,
  Search,
  Table2,
  KanbanSquare,
  Pencil,
  Trash2,
  ExternalLink,
  AlarmClock,
} from 'lucide-react'
import type { Application, Status } from '../types'
import { STATUSES, STATUS_LABELS } from '../types'
import { useApplications, updateApplication, deleteApplication, isDue } from '../storage'
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
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
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
          <tr className="border-b border-slate-800 bg-slate-900/80 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3">Entreprise</th>
            <th className="px-4 py-3">Poste</th>
            <th className="px-4 py-3">Statut</th>
            <th className="px-4 py-3">Postulée le</th>
            <th className="px-4 py-3">Relance</th>
            <th className="px-4 py-3">Source</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/70">
          {apps.map((a) => (
            <tr key={a.id} className="group bg-slate-900/40 hover:bg-slate-800/40">
              <td className="px-4 py-3 font-medium">
                <span className="flex items-center gap-1.5">
                  {a.company}
                  {a.url && (
                    <a href={a.url} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-indigo-400">
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
                  <button onClick={() => onEdit(a)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-700 hover:text-slate-100">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => onDelete(a)} className="rounded-md p-1.5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300">
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
