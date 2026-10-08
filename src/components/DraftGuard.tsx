import { useBlocker } from '@tanstack/react-router'

export function DraftGuard({ dirty }: { dirty: boolean }) {
  const blocker = useBlocker({
    disabled: !dirty,
    enableBeforeUnload: dirty,
    shouldBlockFn: () => true,
    withResolver: true,
  })
  if (blocker.status !== 'blocked') return null
  return <div role="dialog" aria-modal="true" aria-label="Brouillon non enregistré" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
    <div className="max-w-md rounded-xl border border-amber-500/40 bg-slate-900 p-6">
      <p>Des modifications ne sont pas enregistrées. Quitter abandonnera ce brouillon.</p>
      <div className="mt-4 flex gap-3">
        <button className="rounded-lg bg-indigo-500 px-3 py-2" onClick={() => blocker.reset()}>Conserver le brouillon</button>
        <button className="px-3 py-2 text-rose-300" onClick={() => blocker.proceed()}>Quitter sans enregistrer</button>
      </div>
    </div>
  </div>
}
