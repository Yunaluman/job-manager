import { useEffect } from 'react'
import { synchronize, usePersistenceStatus, useInitializationError } from '../data'

export function PersistenceBanner() {
  const status = usePersistenceStatus()
  const initializationError = useInitializationError()
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (status.pending || status.blocked) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [status.pending, status.blocked])
  const message = initializationError || status.error
  if (!message && status.ready && !status.pending) return null
  return <div role={message ? 'alert' : 'status'} className="mb-4 rounded-lg border border-amber-500/30 p-3 text-sm text-amber-700 dark:text-amber-300">
    {message || (status.pending ? 'Enregistrement ou synchronisation en cours…' : 'Chargement des données…')}
    {(status.blocked || !status.ready) && <button disabled={status.pending > 0} className="ml-3 underline" onClick={() => void synchronize().catch(() => {})}>Synchroniser</button>}
  </div>
}
