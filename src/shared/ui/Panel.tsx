import type { HTMLAttributes } from 'react'

export function Panel({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`app-panel min-w-0 ${className}`} {...props} />
}
