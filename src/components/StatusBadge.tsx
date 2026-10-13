import { STATUS_COLORS } from '../types'
import { Badge } from '../shared/ui/Badge'
import type { Status, Application } from '../../shared/contracts/types'
import { STATUS_LABELS, applicationStatusLabel } from '../../shared/contracts/types'

export function StatusBadge({ status, application }: { status: Status; application?: Application }) {
  return (
    <Badge
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}
    >
      {application ? applicationStatusLabel(application) : STATUS_LABELS[status]}
    </Badge>
  )
}
