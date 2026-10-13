import { Button } from '../shared/ui/Button'
import { useRef, useState } from 'react'
import { synchronize, usePersistenceStatus } from '../data'
import { DraftGuard } from './DraftGuard'
export function WriteForm({ dirty, save, children, label = 'Enregistrer', onSaved, disabled = false }: { dirty: boolean; save: () => Promise<unknown>; children: React.ReactNode; label?: string; onSaved?: () => void; disabled?: boolean }) {
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const status = usePersistenceStatus()
  return <form onSubmit={(event) => { event.preventDefault(); if (inFlight.current || disabled) return; inFlight.current = true; setBusy(true); setError(''); setSuccess(false); void save().then(() => { setSuccess(true); onSaved?.() }).catch((reason) => setError(reason.message)).finally(() => { inFlight.current = false; setBusy(false) }) }}>
    <DraftGuard dirty={dirty} /><fieldset disabled={busy || disabled} className="space-y-4">{children}</fieldset>
    {success && !dirty && <p role="status" className="mt-3 text-sm text-emerald-700">Enregistrement confirmé.</p>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
    {status.blocked && <Button type="button" className="app-button mt-3" disabled={busy || status.pending > 0} onClick={() => void synchronize().catch((reason) => setError(reason.message))}>Synchroniser sans perdre le brouillon</Button>}
    <Button type="submit" className="app-primary mt-4" disabled={disabled || busy || status.blocked || !status.ready}>{busy ? 'Enregistrement…' : label}</Button>
  </form>
}
