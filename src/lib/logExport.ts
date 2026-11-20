import type { LogRange, LogSource } from '@/lib/api'

export const LOG_RANGES: Array<{ value: LogRange; days: 1 | 7 | 30; label: string }> = [
  { value: '1d', days: 1, label: '1 day' },
  { value: '7d', days: 7, label: '7 days' },
  { value: '30d', days: 30, label: '30 days' },
]

export function logSourceLabel(source?: LogSource) {
  if (source === 'retained') return 'Full log history (Loki)'
  if (source === 'kubernetes') return 'Current pod logs only (Kubernetes)'
  return 'Not reported'
}
