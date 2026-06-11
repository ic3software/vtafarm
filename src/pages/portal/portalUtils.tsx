import type { SetupSession } from '@/lib/api'

export function statusBadge(status: SetupSession['status']) {
  const map: Record<SetupSession['status'], { cls: string; label: string }> = {
    dns_provisioned:    { cls: 'badge-secondary',   label: 'DNS provisioned' },
    vta_setup_running:  { cls: 'badge-warning',     label: 'setup running' },
    vta_setup_complete: { cls: 'badge-warning',     label: 'setup complete' },
    provisioning:       { cls: 'badge-warning',     label: 'provisioning' },
    running:            { cls: 'badge-success',     label: 'running' },
    failed:             { cls: 'badge-destructive', label: 'failed' },
  }
  const { cls, label } = map[status] ?? { cls: 'badge-secondary', label: status }
  const done = status === 'running'
  const pulse = !done && status !== 'failed' && status !== 'dns_provisioned'
  return (
    <span className={`p-badge ${cls}`}>
      {pulse
        ? <span className="dot pulse-dot" />
        : done
          ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path d="M20 6 9 17l-5-5"/></svg>
          : status === 'failed'
            ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M18 6 6 18M6 6l12 12"/></svg>
            : null}
      {label}
    </span>
  )
}

export function initials(uniqueId: string) {
  return uniqueId.slice(0, 2).toUpperCase() || '??'
}

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hr ago`
  return `${Math.floor(h / 24)} days ago`
}
