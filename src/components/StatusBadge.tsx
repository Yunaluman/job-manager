import type { Status, Application } from '../types'
import { STATUS_COLORS, STATUS_LABELS, applicationStatusLabel } from '../types'

export function StatusBadge({ status, application }: { status: Status; application?: Application }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}
    >
      {application ? applicationStatusLabel(application) : STATUS_LABELS[status]}
    </span>
  )
}
