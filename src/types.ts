import type { Status } from '../shared/contracts/types'
export * from '../shared/contracts/types'
export const STATUS_COLORS: Record<Status, string> = {
  a_postuler: 'bg-subtle text-secondary border-line',
  postulee: 'bg-sky-500/10 text-sky-800 dark:text-sky-300 border-sky-500/30',
  relancee: 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30',
  entretien: 'bg-violet-500/10 text-violet-800 dark:text-violet-300 border-violet-500/30',
  offre: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/30',
  refusee: 'bg-rose-500/10 text-rose-800 dark:text-rose-300 border-rose-500/30',
}
