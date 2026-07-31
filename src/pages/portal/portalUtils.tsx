import { useState, useEffect } from 'react'
import { api, type DomainInfo, type DomainType, type SetupSession, type SetupStatus, type StackConnection } from '@/lib/api'

const STATUS_META: Record<SetupStatus, { cls: string; label: string }> = {
  // vta_only
  dns_provisioned:    { cls: 'badge-secondary',   label: 'DNS provisioned' },
  vta_setup_running:  { cls: 'badge-warning',     label: 'setup running' },
  vta_setup_complete: { cls: 'badge-warning',     label: 'setup complete' },
  provisioning:       { cls: 'badge-warning',     label: 'provisioning' },
  running:            { cls: 'badge-success',     label: 'running' },
  // full_stack
  dns_provision:         { cls: 'badge-secondary', label: 'DNS provisioning' },
  // Every session confirms its hostnames resolve before any cluster resources
  // are spent on them; only a custom domain waits for a certificate.
  dns_wait:               { cls: 'badge-warning',   label: 'verifying DNS' },
  env_provision:          { cls: 'badge-warning',   label: 'env provisioning' },
  k8s_provision:          { cls: 'badge-warning',   label: 'k8s provisioning' },
  tls_provision:          { cls: 'badge-warning',   label: 'issuing certificate' },
  step_vta_setup:         { cls: 'badge-warning',   label: 'VTA setup' },
  step_mediator_p1:       { cls: 'badge-warning',   label: 'mediator setup (1/3)' },
  step_mediator_reprov:   { cls: 'badge-warning',   label: 'mediator setup (2/3)' },
  step_mediator_p2:       { cls: 'badge-warning',   label: 'mediator setup (3/3)' },
  step_dids_p1:           { cls: 'badge-warning',   label: 'DID hosting setup (1/4)' },
  step_dids_provision:    { cls: 'badge-warning',   label: 'DID hosting setup (2/4)' },
  step_dids_p2:           { cls: 'badge-warning',   label: 'DID hosting setup (3/4)' },
  step_dids_invite:       { cls: 'badge-warning',   label: 'DID hosting setup (4/4)' },
  step_dids_load_did:     { cls: 'badge-warning',   label: 'loading DID logs' },
  step_dids_grant_farm:   { cls: 'badge-warning',   label: 'granting farm access' },
  deploy_dids:            { cls: 'badge-warning',   label: 'deploying DID host' },
  deploy_mediator:        { cls: 'badge-warning',   label: 'deploying mediator' },
  step_vta_register_dids: { cls: 'badge-warning',   label: 'registering DID host with VTA' },
  awaiting_admin_did:     { cls: 'badge-warning',   label: 'awaiting admin DID' },
  step_import_admin_did:  { cls: 'badge-warning',   label: 'importing admin DID' },
  deploy_vta:             { cls: 'badge-warning',   label: 'deploying VTA' },
  step_vtc_setup_key:     { cls: 'badge-warning',   label: 'VTC setup (1/2)' },
  step_vtc_acl_grant:     { cls: 'badge-warning',   label: 'VTC setup (2/2)' },
  step_vtc_setup:         { cls: 'badge-warning',   label: 'VTC community setup' },
  deploy_vtc:             { cls: 'badge-warning',   label: 'deploying VTC' },
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

// Where a session's hostnames come from. `managed` is the default and the
// common case, so it stays quiet; the other two are worth noticing.
const DOMAIN_TYPE_META: Record<DomainType, { cls: string; label: string }> = {
  managed: { cls: 'badge-secondary', label: 'managed' },
  custom: { cls: 'badge-default', label: 'custom' },
  platform: { cls: 'badge-warning', label: 'platform' },
}

export function domainTypeBadge(type: DomainType | undefined) {
  const meta = DOMAIN_TYPE_META[type ?? 'managed'] ?? DOMAIN_TYPE_META.managed
  return <span className={`p-badge ${meta.cls}`}>{meta.label}</span>
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
  { key: 'create',    label: 'Create session',   statuses: [] },
  { key: 'dns_env',   label: 'DNS & environment', statuses: ['dns_provisioned'] },
  { key: 'vta_setup', label: 'VTA setup',        statuses: ['vta_setup_running'] },
  { key: 'admin_did', label: 'Admin DID',        statuses: ['vta_setup_complete'] },
  { key: 'deploy_vta', label: 'Deploy VTA',      statuses: ['provisioning'] },
  { key: 'running',   label: 'Running',          statuses: ['running'] },
]

// The full_stack pipeline. The two offline VTC prep steps (setup key + ACL
// grant) run right after the admin DID is imported, so they fold into that
// phase; the live community setup and its deploy get their own phase after
// the VTA is up.
export const FULL_STACK_PHASES: Phase[] = [
  { key: 'create',    label: 'Create session',    statuses: [] },
  // dns_wait and tls_provision fold in here rather than adding steps: they are
  // both pre-flight for the same phase, and the stepper keeps one shape for
  // every mode and domain kind.
  { key: 'dns_env',   label: 'DNS & environment', statuses: ['dns_provision', 'dns_wait', 'env_provision', 'k8s_provision', 'tls_provision'] },
  { key: 'vta_setup', label: 'VTA setup',         statuses: ['step_vta_setup'] },
  { key: 'mediator',  label: 'Mediator setup',    statuses: ['step_mediator_p1', 'step_mediator_reprov', 'step_mediator_p2'] },
  { key: 'dids',      label: 'DID hosting setup', statuses: ['step_dids_p1', 'step_dids_provision', 'step_dids_p2', 'step_dids_invite', 'step_dids_load_did', 'step_dids_grant_farm'] },
  { key: 'going_live', label: 'Deploy D+M',       statuses: ['deploy_dids', 'deploy_mediator', 'step_vta_register_dids'] },
  { key: 'admin_did', label: 'Admin DID',         statuses: ['awaiting_admin_did', 'step_import_admin_did', 'step_vtc_setup_key', 'step_vtc_acl_grant'] },
  { key: 'deploy_vta', label: 'Deploy VTA',       statuses: ['deploy_vta'] },
  { key: 'vtc',       label: 'VTC setup',         statuses: ['step_vtc_setup', 'deploy_vtc'] },
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

// ── Hostnames ────────────────────────────────────────────────────────────────

export type HostComponent = 'vta' | 'vtc' | 'mediator' | 'dids'

/**
 * The hostname one component of a session gets — the single place the UI is
 * allowed to compose one, mirroring the API's own derivation.
 *
 * `fixedLabels` selects the form custom and platform domains use, where the
 * four labels are the same for every session (`vta.aaa.com`) because the
 * domain already identifies the owner; managed domains carry the user-chosen
 * name in the label (`vta-alice.firstperson.dev`). Note the VTC's name is its
 * own `vtc_name`, not the session's `vta_name`.
 *
 * `env_prefix` is applied for us, so `dev-` appears automatically against a
 * local API.
 */
export function componentHost(
  info: DomainInfo,
  component: HostComponent,
  opts: { fixedLabels: boolean; name?: string; domain?: string },
): string {
  const label = opts.fixedLabels
    ? `${info.env_prefix}${component}`
    : `${info.env_prefix}${component}-${opts.name}`
  return `${label}.${opts.domain ?? info.managed_domain}`
}

// Environment-static, so one fetch serves every view for the lifetime of the
// page. Returns null until it resolves — render the surrounding copy without
// the hostname rather than guessing at one.
//
// Two caches because there are two endpoints: the portal and the admin panel
// authenticate with different cookies, so each has its own route returning the
// identical payload.
const domainInfoCache: Record<'user' | 'admin', Promise<DomainInfo> | null> = { user: null, admin: null }

export function useDomainInfo(variant: 'user' | 'admin' = 'user'): DomainInfo | null {
  const [info, setInfo] = useState<DomainInfo | null>(null)
  useEffect(() => {
    let cancelled = false
    domainInfoCache[variant] ??= variant === 'admin' ? api.adminDomainInfo() : api.domainInfo()
    domainInfoCache[variant]!
      .then(d => { if (!cancelled) setInfo(d) })
      .catch(() => { domainInfoCache[variant] = null })
    return () => { cancelled = true }
  }, [variant])
  return info
}

// ── Shared admin-DID (did:key) validation ────────────────────────────────────

const ADMIN_DID_RE = /^did:key:z[1-9A-HJ-NP-Za-km-z]+$/

export function isValidAdminDid(s: string): boolean {
  return ADMIN_DID_RE.test(s)
}

// ── Stack connection bundles ─────────────────────────────────────────────────

// Mirrors internal/setup/sharecode.go. The two must agree: this decides whether
// a code is even worth sending, and the server decides whether it opens
// anything.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CROCKFORD_CHECK = CROCKFORD + '*~$=U'
const SHARE_CODE_DATA_LEN = 15

/**
 * Folds a share code to the form the server compares: dashes and whitespace
 * gone, uppercased, and the glyphs people substitute anyway mapped back the way
 * Crockford specifies (I and L to 1, O to 0).
 */
export function normalizeShareCode(code: string): string {
  let out = ''
  for (const ch of code.toUpperCase()) {
    if (ch === '-' || /\s/.test(ch)) continue
    if (ch === 'I' || ch === 'L') out += '1'
    else if (ch === 'O') out += '0'
    else out += ch
  }
  return out
}

function crockfordCheckSymbol(data: string): string {
  let rem = 0
  for (const ch of data) {
    const v = CROCKFORD.indexOf(ch)
    if (v < 0) return ''
    rem = (rem * 32 + v) % 37
  }
  return CROCKFORD_CHECK[rem]
}

/**
 * Whether a share code is well-formed — right length, valid characters, and a
 * check character that matches its data.
 *
 * This is what makes "you mistyped this" an instant, separate answer from "this
 * code doesn't open anything here". The second is deliberately vague on the
 * server (it covers five different situations on purpose), so a single
 * hand-copied character would otherwise land in the least helpful message in
 * the flow.
 */
export function isWellFormedShareCode(code: string): boolean {
  const n = normalizeShareCode(code)
  if (n.length !== SHARE_CODE_DATA_LEN + 1) return false
  const data = n.slice(0, SHARE_CODE_DATA_LEN)
  for (const ch of data) if (!CROCKFORD.includes(ch)) return false
  return n[SHARE_CODE_DATA_LEN] === crockfordCheckSymbol(data)
}

export type BundleParse =
  | { ok: true; bundle: StackConnection }
  | { ok: false; error: string }

/**
 * Parses pasted text into a connection bundle, without deciding whether it
 * opens anything — that answer only the server has.
 *
 * Everything here is shape: is this the right kind of document, and is the code
 * even worth sending. A parsed bundle must still be confirmed with
 * `api.validateConnection` before anything is shown as a fact about a stack.
 */
export function parseConnectionBundle(text: string): BundleParse {
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, error: '' }

  let raw: unknown
  try {
    raw = JSON.parse(trimmed)
  } catch {
    return { ok: false, error: "That doesn't look like a connection bundle. Ask for the text from the stack's Share panel." }
  }
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: "That doesn't look like a connection bundle. Ask for the text from the stack's Share panel." }
  }

  const b = raw as Partial<StackConnection>
  if (b.kind !== 'vtafarm.stack-connection') {
    return { ok: false, error: "That doesn't look like a connection bundle. Ask for the text from the stack's Share panel." }
  }
  if (!b.stack || !b.code || !b.farm) {
    return { ok: false, error: "That connection bundle is incomplete. Ask for the text from the stack's Share panel." }
  }
  if (!isWellFormedShareCode(b.code)) {
    return { ok: false, error: 'The share code looks mistyped — check it against what you were sent.' }
  }
  return { ok: true, bundle: b as StackConnection }
}

/**
 * Turns the API's refusal reason into a sentence.
 *
 * `invalid_bundle` covers five different server-side situations on purpose
 * (API §5.1) and this copy must not try to narrow it — guessing would mislead,
 * and anything more specific would turn the field into a way to discover which
 * stacks exist and which are shared.
 */
export function connectionRefusalMessage(reason: string | undefined, fallback: string): string {
  switch (reason) {
    case 'bad_bundle':
      return "That doesn't look like a connection bundle. Ask for the text from the stack's Share panel."
    case 'wrong_farm':
      return 'This bundle is for a different VTA Farm. You can only connect to stacks running here.'
    case 'invalid_bundle':
      return 'This bundle doesn’t open anything here. It may have been deleted, or its owner may have turned sharing off or issued a new code — ask them for a current one.'
    case 'stack_not_running':
      return "That stack isn't running right now. Ask its owner to check it, then try again."
    case 'stack_changed':
      return 'This bundle is out of date — the stack has changed since it was copied. Ask for a fresh one.'
    case 'stack_at_connection_limit':
      return 'That stack has reached its limit of connected agents. Ask an admin to raise the limit, or use a different stack.'
    default:
      return fallback
  }
}
