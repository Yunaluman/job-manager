import { Button } from '../shared/ui/Button'
import { useEffect, useId, useSyncExternalStore } from 'react'
import { useBlocker } from '@tanstack/react-router'
import { useModalFocus } from '../useModalFocus'

const drafts = new Set<string>()
const listeners = new Set<() => void>()
export const hasUnsavedDrafts = () => drafts.size > 0
const publish = () => listeners.forEach(listener => listener())
export function DraftGuard({ dirty }: { dirty: boolean }) {
  const id = useId()
  useEffect(() => {
    if (dirty) drafts.add(id)
    else drafts.delete(id)
    publish()
    return () => { drafts.delete(id); publish() }
  }, [dirty, id])
  return null
}
export function DraftNavigationGuard() {
  const dirty = useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => drafts.size > 0)
  const blocker = useBlocker({
    disabled: !dirty,
    enableBeforeUnload: dirty,
    shouldBlockFn: () => true,
    withResolver: true,
  })
  const modalRef = useModalFocus(blocker.status === 'blocked', () => { if (blocker.status === 'blocked') blocker.reset() })
  if (blocker.status !== 'blocked') return null
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
    <div ref={modalRef} role="dialog" aria-modal="true" aria-label="Modifications non enregistrées" className="max-w-md rounded-xl border border-amber-500/40 bg-surface p-6">
      <p>Des modifications ne sont pas enregistrées. Quitter abandonnera les brouillons de cette page.</p>
      <p className="mt-2 text-sm text-muted">Rester permet de continuer ; cela n’enregistre rien.</p><div className="mt-4 flex flex-wrap gap-3">
        <Button type="submit" className="app-primary" onClick={() => blocker.reset()}>Rester et continuer</Button>
        <Button type="submit" className="px-3 py-2 text-rose-700 dark:text-rose-300" onClick={() => blocker.proceed()}>Quitter sans enregistrer</Button>
      </div>
    </div>
  </div>
}
