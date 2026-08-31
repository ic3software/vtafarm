import type { LoadTestRun } from '@/lib/api'

export function LoadTestRunBadge({ status }: { status: LoadTestRun['status'] }) {
  const cls = status === 'deleted' ? 'badge-secondary'
    : status === 'failed' || status === 'partial' || status === 'delete_failed' ? 'badge-destructive'
      : status === 'active' ? 'badge-success' : 'badge-warning'
  return <span className={`p-badge ${cls}`}>{status.replace('_', ' ')}</span>
}
