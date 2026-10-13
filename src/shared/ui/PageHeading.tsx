import type { ReactNode } from 'react'

export function PageHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
    <div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm text-muted">{description}</p>}</div>
    {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
  </div>
}
