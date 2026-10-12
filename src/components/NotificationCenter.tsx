import { useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Bell, X } from 'lucide-react'
import { useData, usePersistenceStatus } from '../data'
import { actionNotifications } from '../actions-core.mjs'
import { usePlanningDay } from '../PlanningClock'
import { markNotificationsRead, STAGE_LABELS } from '../actions'
import type { ActionNotification } from '../action-types'
import { useModalFocus } from '../useModalFocus'

export function NotificationCenter() {
  const { actions, applications, notificationReads } = useData()
  const day = usePlanningDay()
  const persistence = usePersistenceStatus()
  const items = actionNotifications(actions, applications, notificationReads, day)
  const unread = items.filter((item) => item.unread)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [error, setError] = useState('')
  const modal = useModalFocus<HTMLDivElement>(open, () => { if (!inFlight.current) setOpen(false) })
  const read = async (selected: ActionNotification[]) => {
    if (inFlight.current || !selected.length) return
    inFlight.current = true; setBusy(true); setError('')
    try { await markNotificationsRead(selected) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Lecture non confirmée.') }
    finally { inFlight.current = false; setBusy(false) }
  }
  const disabled = busy || !persistence.ready || persistence.blocked
  return <><button className="app-button relative" aria-label={`Notifications (${unread.length} non lues)`} onClick={() => setOpen(true)}><Bell size={18} />{unread.length > 0 && <span className="rounded-full bg-indigo-600 px-1.5 text-xs text-white">{unread.length}</span>}</button>
    {open && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3 sm:p-6"><div ref={modal} role="dialog" aria-modal="true" aria-label="Notifications importantes" className="app-modal max-h-[90vh] w-full max-w-2xl overflow-y-auto">
      <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Notifications importantes</h2><button className="app-button" aria-label="Fermer les notifications" disabled={busy} onClick={() => setOpen(false)}><X size={18} /></button></div>
      <p className="mb-3 text-sm text-muted">Dans JobPilot uniquement. Lire une alerte ne termine pas l’action. Les copies CSV ne sont pas synchronisées en direct.</p>
      <button className="app-button mb-4" disabled={disabled || !unread.length} onClick={() => void read(unread)}>Marquer toutes les alertes affichées comme lues</button>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      {!items.length && <p className="text-sm text-muted">Aucune échéance à signaler.</p>}
      <ul className="space-y-3">{items.map((item) => <li className="rounded-xl border border-line p-4" key={item.id}><p className="text-sm font-semibold">{STAGE_LABELS[item.stage]}{item.unread ? ' · Non lue' : ' · Lue'}</p><p className="mt-1 break-words">{item.title}</p><p className="mt-1 text-xs text-muted">{item.dueDate} · {item.origin === 'source' ? 'Échéance du dossier' : 'Action locale'}{item.priority === 'high' && ' · Priorité haute'}</p>
        {applications.find((app) => app.id === item.applicationId)?.register && <p className="mt-1 text-xs text-muted">Copie CSV importée le {new Date(applications.find((app) => app.id === item.applicationId)!.register!.importedAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}</p>}
        <div className="mt-3 flex flex-wrap gap-2">{item.actionId ? <Link className="app-button" to="/actions" search={{ action: item.actionId }} onClick={() => setOpen(false)}>Voir l’action</Link> : <Link className="app-button" to="/candidatures/$id" params={{ id: item.applicationId! }} onClick={() => setOpen(false)}>Voir le dossier</Link>}<button className="app-button" disabled={disabled || !item.unread} onClick={() => void read([item])}>Marquer comme lue</button></div>
      </li>)}</ul>
    </div></div>}
  </>
}
