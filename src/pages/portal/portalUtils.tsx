import { useState } from 'react'
import type { SetupSession, SetupStatus } from '@/lib/api'

const STATUS_META: Record<SetupStatus, { cls: string; label: string }> = {
  // vta_only
  dns_provisioned:    { cls: 'badge-secondary',   label: 'DNS provisioned' },
  vta_setup_running:  { cls: 'badge-warning',     label: 'setup running' },
  vta_setup_complete: { cls: 'badge-warning',     label: 'setup complete' },
  provisioning:       { cls: 'badge-warning',     label: 'provisioning' },
  running:            { cls: 'badge-success',     label: 'running' },
  // full_stack
  dns_provision:         { cls: 'badge-secondary', label: 'DNS provisioning' },
  env_provision:          { cls: 'badge-warning',   label: 'env provisioning' },
  k8s_provision:          { cls: 'badge-warning',   label: 'k8s provisioning' },
  step_vta_setup:         { cls: 'badge-warning',   label: 'VTA setup' },
  step_mediator_p1:       { cls: 'badge-warning',   label: 'mediator setup (1/3)' },
  step_mediator_reprov:   { cls: 'badge-warning',   label: 'mediator setup (2/3)' },
  step_mediator_p2:       { cls: 'badge-warning',   label: 'mediator setup (3/3)' },
  step_dids_p1:           { cls: 'badge-warning',   label: 'DID hosting setup (1/4)' },
  step_dids_provision:    { cls: 'badge-warning',   label: 'DID hosting setup (2/4)' },
  step_dids_p2:           { cls: 'badge-warning',   label: 'DID hosting setup (3/4)' },
  step_dids_invite:       { cls: 'badge-warning',   label: 'DID hosting setup (4/4)' },
  step_dids_load_did:     { cls: 'badge-warning',   label: 'loading DID logs' },
  deploy_dids:            { cls: 'badge-warning',   label: 'deploying DID host' },
  deploy_mediator:        { cls: 'badge-warning',   label: 'deploying mediator' },
  awaiting_admin_did:     { cls: 'badge-warning',   label: 'awaiting admin DID' },
  step_import_admin_did:  { cls: 'badge-warning',   label: 'importing admin DID' },
  deploy_vta:             { cls: 'badge-warning',   label: 'deploying VTA' },
  // shared
  failed: { cls: 'badge-destructive', label: 'failed' },
}

const NON_PULSING = new Set<SetupStatus>(['dns_provisioned', 'dns_provision'])

export function statusBadge(status: SetupSession['status']) {
  const { cls, label } = STATUS_META[status] ?? { cls: 'badge-secondary', label: status }
  const done = status === 'running'
  const failed = status === 'failed'
  const pulse = !done && !failed && !NON_PULSING.has(status)
  return (
    <span className={`p-badge ${cls}`}>
      {pulse
        ? <span className="dot pulse-dot" />
        : done
          ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path d="M20 6 9 17l-5-5"/></svg>
          : failed
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

// ── Phase grouping (coarse UI phases over the raw backend status machine) ────

export interface Phase {
  key: string
  label: string
  statuses: SetupStatus[]
}

export const VTA_ONLY_PHASES: Phase[] = [
  { key: 'create',         label: 'Create session',   statuses: [] },
  { key: 'dns',             label: 'DNS provisioned',  statuses: ['dns_provisioned'] },
  { key: 'setup_running',   label: 'Setup running',    statuses: ['vta_setup_running'] },
  { key: 'setup_complete',  label: 'Setup complete',   statuses: ['vta_setup_complete'] },
  { key: 'provisioning',    label: 'Provisioning',     statuses: ['provisioning'] },
  { key: 'running',         label: 'Running',          statuses: ['running'] },
]

export const FULL_STACK_PHASES: Phase[] = [
  { key: 'create',    label: 'Create session',    statuses: [] },
  { key: 'dns_env',   label: 'DNS & environment', statuses: ['dns_provision', 'env_provision', 'k8s_provision'] },
  { key: 'vta_setup', label: 'VTA setup',         statuses: ['step_vta_setup'] },
  { key: 'mediator',  label: 'Mediator setup',    statuses: ['step_mediator_p1', 'step_mediator_reprov', 'step_mediator_p2'] },
  { key: 'dids',      label: 'DID hosting setup', statuses: ['step_dids_p1', 'step_dids_provision', 'step_dids_p2', 'step_dids_invite', 'step_dids_load_did'] },
  { key: 'going_live', label: 'Deploy D+M',       statuses: ['deploy_dids', 'deploy_mediator'] },
  { key: 'admin_did', label: 'Admin DID',         statuses: ['awaiting_admin_did', 'step_import_admin_did'] },
  { key: 'deploy_vta', label: 'Deploy VTA',       statuses: ['deploy_vta'] },
  { key: 'running',   label: 'Running',           statuses: ['running'] },
]

export function phaseIndex(phases: Phase[], status: SetupStatus | undefined): number {
  if (!status) return 0
  return phases.findIndex(p => p.statuses.includes(status))
}

// ── Copy-to-clipboard helper for the many copyable values in full_stack output ──

export function useCopyState(timeoutMs = 2000) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  function copy(key: string, value: string) {
    navigator.clipboard.writeText(value).catch(() => {})
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(k => (k === key ? null : k)), timeoutMs)
  }
  return { copiedKey, copy }
}

// ── Shared admin-DID (did:key) validation ────────────────────────────────────

const ADMIN_DID_RE = /^did:key:z[1-9A-HJ-NP-Za-km-z]+$/

export function isValidAdminDid(s: string): boolean {
  return ADMIN_DID_RE.test(s)
}
