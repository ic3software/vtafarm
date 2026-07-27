const _apiUrl = import.meta.env.VITE_API_URL
if (!_apiUrl) throw new Error('VITE_API_URL is not set. Create a .env file with VITE_API_URL=<backend URL>.')
export const API_BASE: string = _apiUrl

export type SetupStatus =
  // vta_only
  | 'dns_provisioned' | 'vta_setup_running' | 'vta_setup_complete' | 'provisioning' | 'running'
  // full_stack
  | 'dns_provision' | 'dns_wait' | 'env_provision' | 'k8s_provision' | 'tls_provision'
  | 'step_vta_setup'
  | 'step_mediator_p1' | 'step_mediator_reprov' | 'step_mediator_p2'
  | 'step_dids_p1' | 'step_dids_provision' | 'step_dids_p2' | 'step_dids_invite'
  | 'step_dids_load_did' | 'deploy_dids' | 'deploy_mediator'
  | 'step_vta_register_dids' | 'awaiting_admin_did' | 'step_import_admin_did'
  | 'step_vtc_setup_key' | 'step_vtc_acl_grant' | 'deploy_vta'
  | 'step_vtc_setup' | 'deploy_vtc'
  // shared
  | 'failed'

export type SetupMode = 'vta_only' | 'full_stack'

/**
 * Where a session's hostnames come from — orthogonal to its mode.
 *
 * `managed` derives the labels from the user's chosen name in our own zone
 * (`vta-alice.firstperson.dev`); `custom` and `platform` both use the four
 * fixed labels (`vta.`, `vtc.`, `mediator.`, `dids.`) and differ only in who
 * owns the zone — theirs vs. ours.
 */
export type DomainType = 'managed' | 'custom' | 'platform'

/**
 * The kind of a `domains` row. Narrower than `DomainType`: a managed session
 * has no domain row at all, so `managed` is not a kind anything can carry.
 */
export type DomainKind = 'custom' | 'platform'

export interface SetupSessionUrls {
  vta: string
  mediator: string
  dids: string
  vtc: string
}

export interface SetupSessionCollected {
  vta_did?: string
  mediator_did?: string
  did_hosting_did?: string
  mediator_admin_did?: string
  did_hosting_admin_did?: string
  vtc_did?: string
}

export interface SetupSessionActionRequired {
  dids_admin_enroll_url?: string
  reveal_keys_once?: boolean
  install_url?: string
  claim_code?: string
}

export interface SetupSession {
  id: string
  status: SetupStatus
  mode: SetupMode
  /** managed | custom | platform — where this session's hostnames come from. */
  domain_type?: DomainType
  /** The zone the hostnames sit under (`firstperson.dev`, `aaa.com`). */
  domain?: string
  url?: string
  urls?: SetupSessionUrls
  vta_name?: string
  vta_image?: string
  mediator_image?: string
  dids_image?: string
  vtc_image?: string
  vta_did?: string
  mediator_did?: string
  collected?: SetupSessionCollected
  action_required?: SetupSessionActionRequired
  dids_enroll_used?: boolean
  vtc_install_used?: boolean
  mediator_admin_key?: string
  webvh_admin_key?: string
  error_msg?: string
  created_at: string
  updated_at?: string
}

/**
 * Why a mode can't be created right now.
 *
 * `at_capacity` is transient. The three `platform_stack_*` /
 * `shared_infra_*` reasons are `vta_only`-only: that mode is just the VTA,
 * wired to the mediator and DID hosting the **platform stack** provides, so it
 * cannot be created before an admin has stood that up and pointed this server
 * at it. `full_stack` runs its own and is never gated on it.
 */
export type UnavailableReason =
  | 'at_capacity'
  | 'platform_stack_missing'
  | 'platform_stack_not_ready'
  | 'shared_infra_unconfigured'

/** Whether one mode can be created, and if not, why. */
export interface ModeAvailability {
  count: number
  available: boolean
  reason?: UnavailableReason
  /** A sentence to show the user. Prefer it over composing copy client-side. */
  detail?: string
}

/**
 * Per-mode createability, used by the create screen to disable the button
 * before submitting.
 *
 * Capacity fails open: when the cluster can't be measured, `determinable` is
 * false and no mode is blocked on capacity, so a transient outage never wrongly
 * stops creation. The platform-stack dependency is not capacity and does not
 * fail open — it's a hard prerequisite, so `available` already accounts for it.
 */
export interface SetupAvailability {
  vta_only: ModeAvailability
  full_stack: ModeAvailability
  metrics_available: boolean
  storage_available: boolean
  determinable: boolean
}

/**
 * Hostname facts for this environment, so the UI never hardcodes the
 * production shape (`vta-<name>.firstperson.dev`), which is wrong against a
 * local API and will be wrong again for custom and platform domains. Route
 * every displayed hostname through `componentHost()` in `portalUtils`.
 */
export interface DomainInfo {
  /** The zone managed sessions are created under (CLUSTER_DOMAIN). */
  managed_domain: string
  /** Prefixed onto every DNS label the API creates — `dev-` locally, `` in production. */
  env_prefix: string
  /** External IP of the cluster ingress; empty when the cluster isn't configured. */
  target_ip: string
  /** Hostname a custom domain's records point at, e.g. `dev-lb.firstperson.dev`. */
  target_host?: string
}

export type HostComponentName = 'vta' | 'mediator' | 'dids' | 'vtc'

/**
 * One hostname the user must point at us, plus its last resolution.
 *
 * `expected_value` is always the CNAME target, never an IP: the user's records
 * are effectively permanent — their DID-hosting hostname is embedded in every
 * `did:webvh` the session mints — so they point at a name we can repoint later
 * without anyone editing their DNS again.
 */
export interface DnsRecordStatus {
  component: HostComponentName
  fqdn: string
  expected_type: 'CNAME'
  expected_value: string
  resolved: string[]
  cname?: string
  ok: boolean
  /**
   * Why it failed, in words meant for the user. **Render this rather than
   * composing DNS advice in the UI** — one source of truth, and it stays
   * correct as the checker improves.
   */
  detail?: string
}

/** The control challenge. Accepted at the `_vtafarm-challenge` name or the apex. */
export interface TxtRecordStatus {
  name: string
  expected: string
  /** Every value found at either name; a match on any one passes. */
  found: string[]
  ok: boolean
  detail?: string
}

export interface Domain {
  id: number
  domain: string
  kind: DomainKind
  verified: boolean
  verified_at: string | null
  /** unique_id of the session running on this domain, when there is one. */
  in_use_by?: string
  /** What all four CNAMEs point at. */
  target: string
  /**
   * Whether this response performed live lookups. False on the list endpoint,
   * which never resolves — show a neutral "not checked" state, not a failure.
   */
  checked: boolean
  txt?: TxtRecordStatus
  records: DnsRecordStatus[]
}

export interface UserInfo {
  id: number
  unique_id: string
  role: 'user' | 'admin'
}

export interface User {
  id: number
  unique_id: string
  /** Self-declared at signup (unverified); null for pre-email and admin-invited accounts. */
  email: string | null
  beta_access: boolean
  /**
   * The account that owns the platform stack. Not a login — no passkey, no
   * email — so nothing meant for a person (beta access, recovery links) should
   * be offered on it.
   */
  system?: boolean
  created_at: string
  updated_at: string
}

export interface AdminRecord {
  id: number
  unique_id: string
  created_at: string
  updated_at: string
}

export interface PasskeyRecord {
  id: number
  name: string
  created_at: string
  last_used_at: string | null
}

export interface Invitation {
  id: number
  token: string
  admin_id: number
  expires_at: string
  used_at: string | null
  created_at: string
}

export interface AdminSetupSession {
  id: number
  unique_id: string
  user_unique_id: string
  vta_name: string
  vtc_name?: string
  mode: SetupMode
  /**
   * The `platform` row is the farm's own stack — the one deletion that needs
   * an explicit `confirm` body, since every `vta_only` session loses its
   * mediator and DID host with it.
   */
  domain_type: DomainType
  status: SetupStatus
  error_msg?: string
  fqdn: string
  vta_image?: string
  mediator_image?: string
  dids_image?: string
  vtc_image?: string
  created_at: string
}

/**
 * The farm's own `full_stack` at `vta.{CLUSTER_DOMAIN}` and friends — the
 * mediator and DID host every `vta_only` session points at.
 *
 * `exists: false` covers both "never created" and "created then torn down":
 * the `domains` row outlives its session, so `domain` may still be set in the
 * second case.
 */
export interface PlatformStack {
  exists: boolean
  /** The session's 8-char unique_id — present only while one exists. */
  id?: string
  status?: SetupStatus
  /** Reaches no hostname; it survives only in `did:webvh` paths. */
  label?: string
  domain?: string
  urls?: SetupSessionUrls
  images?: { vta: string; mediator: string; dids: string; vtc: string }
  /**
   * What to paste into the environment once the stack is running. Empty
   * strings until the pipeline mints them — `MEDIATOR_DID` in particular
   * cannot be known before setup completes.
   */
  config_values?: {
    MEDIATOR_DID: string
    DID_HOSTING_SERVER_URL: string
    DID_HOSTING_CONTROL_URL: string
    DID_HOSTING_DID: string
  }
  error_msg?: string
  created_at?: string
  updated_at?: string
}

export interface AdminSessionsPage {
  items: AdminSetupSession[]
  total: number
  page: number
  page_size: number
  /** Per-mode totals, independent of the active filter, plus "all". */
  counts: Record<'all' | SetupMode, number>
}

export interface DashboardNode {
  name: string
  /** False for cordoned/tainted nodes — excluded from capacity estimates. */
  schedulable: boolean
  cpu_allocatable_millis: number
  cpu_requested_millis: number
  cpu_used_millis: number
  mem_allocatable_bytes: number
  mem_requested_bytes: number
  mem_used_bytes: number
}

export interface DashboardStorageNode {
  name: string
  /** False when the Longhorn node or all of its disks have allowScheduling off. */
  schedulable: boolean
  maximum_bytes: number
  reserved_bytes: number
  scheduled_bytes: number
  available_bytes: number
  schedulable_bytes: number
}

export interface DashboardEstimate {
  /** Placement-simulated sessions that still fit — the authoritative number. */
  count: number
  by_cpu: number
  by_memory: number
  /** -1 when storage stats are unavailable. */
  by_storage: number
  limiting_resource: 'cpu' | 'memory' | 'storage'
  cpu_millis_per_session: number
  /** Planning cost based on the sum of component memory limits. */
  mem_bytes_per_session: number
  /** Includes the replica factor. */
  storage_bytes_per_session: number
}

export interface AdminDashboard {
  cluster: {
    cpu: { allocatable_millis: number; requested_millis: number; used_millis: number }
    memory: { allocatable_bytes: number; requested_bytes: number; used_bytes: number }
    storage: {
      maximum_bytes: number
      reserved_bytes: number
      scheduled_bytes: number
      available_bytes: number
      schedulable_bytes: number
      /** Bytes actually written across all Longhorn volumes (thin-provisioned actualSize). */
      data_written_bytes: number
      replica_count: number
    }
  }
  nodes: DashboardNode[]
  storage_nodes: DashboardStorageNode[] | null
  metrics_available: boolean
  storage_available: boolean
  estimates: { vta_only: DashboardEstimate; full_stack: DashboardEstimate }
}

export type UpgradeComponent = 'vta' | 'mediator' | 'dids' | 'vtc'
export const ALL_COMPONENTS: UpgradeComponent[] = ['vta', 'mediator', 'dids', 'vtc']
export type UpgradeBatchStatus = 'running' | 'paused' | 'completed' | 'cancelled'
export type UpgradeTaskStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped'

export interface UpgradeTarget {
  session_id: string
  vta_name: string
  component: UpgradeComponent
  from_image: string
  to_image?: string
}

export interface UpgradeSkipped {
  session_id: string
  component?: UpgradeComponent
  reason: string
}

export interface UpgradeBatchSummary {
  id: number
  /** Who started the batch — 'user' for a self-service session upgrade. */
  initiator: 'admin' | 'user'
  components: UpgradeComponent[]
  concurrency: number
  status: UpgradeBatchStatus
  task_counts: Record<string, number>
  created_at: string
  updated_at: string
}

export interface UpgradeTaskItem {
  session_id: string
  vta_name?: string
  component: UpgradeComponent
  from_image: string
  to_image: string
  status: UpgradeTaskStatus
  error_msg?: string
  updated_at: string
}

export interface UpgradeBatchDetail {
  id: number
  initiator: 'admin' | 'user'
  components: UpgradeComponent[]
  status: UpgradeBatchStatus
  created_at: string
  tasks: UpgradeTaskItem[]
}

// One self-service image change of the user's own session. `paused` means it
// stopped on a task failure — the failed task's error_msg says why.
export interface SessionUpgradeTask {
  component: UpgradeComponent
  from_image: string
  to_image: string
  status: UpgradeTaskStatus
  error_msg?: string
  updated_at: string
}

export interface SessionUpgrade {
  id: number
  status: UpgradeBatchStatus
  components: UpgradeComponent[]
  created_at: string
  tasks: SessionUpgradeTask[]
}

interface ApiError extends Error {
  status: number
}

function apiError(msg: string, status: number): ApiError {
  return Object.assign(new Error(msg), { status }) as ApiError
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return null as T
  const data = await res.json().catch(() => ({ error: res.statusText }))
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event('vtafarm:unauthorized'))
    throw apiError(data.error ?? 'Request failed', res.status)
  }
  return data as T
}

export const api = {
  // ── Auth — User ──────────────────────────────────────────────────────────────
  userPasskeyLoginBegin: () =>
    req<{ session_id: string; publicKey: unknown }>('POST', '/api/v1/auth/user/passkey/begin'),
  userPasskeyLoginComplete: (sessionId: string, credential: unknown) =>
    req<{ token: string; user: UserInfo }>('POST', `/api/v1/auth/user/passkey/complete?session_id=${encodeURIComponent(sessionId)}`, credential),
  userLogout: () => req<null>('POST', '/api/v1/auth/user/logout'),

  // ── Auth — Admin ─────────────────────────────────────────────────────────────
  adminPasskeyLoginBegin: () =>
    req<{ session_id: string; publicKey: unknown }>('POST', '/api/v1/auth/admin/passkey/begin'),
  adminPasskeyLoginComplete: (sessionId: string, credential: unknown) =>
    req<{ token: string; user: UserInfo }>('POST', `/api/v1/auth/admin/passkey/complete?session_id=${encodeURIComponent(sessionId)}`, credential),
  adminLogout: () => req<null>('POST', '/api/v1/auth/admin/logout'),

  // ── Admin enrollment ─────────────────────────────────────────────────────────
  validateEnrollToken: (token: string) =>
    req<{ valid: boolean; expires_at: string }>('GET', `/api/v1/admin/enroll/${token}`),
  enrollAdmin: (token: string) =>
    req<{ id: number; unique_id: string; token: string }>('POST', `/api/v1/admin/enroll/${token}`),

  // ── Admin passkeys ───────────────────────────────────────────────────────────
  adminPasskeyRegisterBegin: () =>
    req<{ publicKey: unknown }>('POST', '/api/v1/admin/passkeys/register/begin'),
  adminPasskeyRegisterComplete: (name: string, credential: unknown) =>
    req<{ id: number; name: string }>('POST', `/api/v1/admin/passkeys/register/complete?name=${encodeURIComponent(name)}`, credential),
  listAdminPasskeys: () => req<PasskeyRecord[]>('GET', '/api/v1/admin/passkeys'),
  deleteAdminPasskey: (id: number) => req<null>('DELETE', `/api/v1/admin/passkeys/${id}`),

  // ── Admin management ─────────────────────────────────────────────────────────
  listAdmins: () => req<AdminRecord[]>('GET', '/api/v1/admin/admins'),
  createAdminEnrollmentToken: () =>
    req<{ enrollment_token: string; enrollment_expires: string }>('POST', '/api/v1/admin/admins'),

  // ── User management ──────────────────────────────────────────────────────────
  listUsers: () => req<User[]>('GET', '/api/v1/admin/users'),
  setUserBetaAccess: (id: string, betaAccess: boolean) =>
    req<{ id: string; beta_access: boolean }>('PUT', `/api/v1/admin/users/${id}/beta-access`, { beta_access: betaAccess }),

  // ── Admin — dashboard ────────────────────────────────────────────────────────
  adminDashboard: () => req<AdminDashboard>('GET', '/api/v1/admin/dashboard'),

  // ── Admin — setup sessions ───────────────────────────────────────────────────
  adminListSessions: (page = 1, mode?: string) =>
    req<AdminSessionsPage>('GET', `/api/v1/admin/setup-sessions?page=${page}${mode ? `&mode=${encodeURIComponent(mode)}` : ''}`),
  adminListImages: (component: UpgradeComponent = 'vta') =>
    req<Array<{ tag: string; image: string; latest?: boolean }>>('GET', `/api/v1/admin/setup/images?component=${component}`),
  /** Admin-cookie twin of `domainInfo` — the admin panel holds a different cookie. */
  adminDomainInfo: () => req<DomainInfo>('GET', '/api/v1/admin/setup/domain-info'),
  /**
   * Tears down any user's session — irreversible. Gate behind a confirmation.
   *
   * `confirm` is the platform stack's label, and the API *requires* it for
   * that one session (400 without it): deleting it takes every `vta_only`
   * session's mediator and DID host with it. Don't reimplement that guard
   * client-side only.
   */
  adminDeleteSession: (id: string, confirm?: string) =>
    req<null>('DELETE', `/api/v1/admin/setup-sessions/${encodeURIComponent(id)}`, confirm ? { confirm } : undefined),

  // ── Admin — platform stack ───────────────────────────────────────────────────
  // The farm's own full stack under our zone's fixed labels. Created whole —
  // domain row, DNS, session — by one action; this is the only route that can
  // mint a domains row for our own zone.
  getPlatformStack: () => req<PlatformStack>('GET', '/api/v1/admin/platform-stack'),
  createPlatformStack: (data: {
    label?: string
    // Required here, unlike POST /setup: the platform session is owned by a
    // passkey-less system account, so nothing could ever resume it if the
    // pipeline parked at awaiting_admin_did.
    admin_did: string
    vta_image: string
    mediator_image: string
    dids_image: string
    vtc_image: string
    portable?: boolean
    pre_rotation_count?: number
  }) =>
    req<{ id: string; status: SetupStatus; label: string; domain: string; urls: SetupSessionUrls }>(
      'POST', '/api/v1/admin/platform-stack', data),

  // ── Admin — upgrade batches ──────────────────────────────────────────────────
  createUpgrade: (data: {
    components: Array<{ component: UpgradeComponent; image: string }>
    session_ids?: string[]
    all?: boolean
    dry_run?: boolean
  }) =>
    req<{ id?: number; status?: UpgradeBatchStatus; targets: UpgradeTarget[]; skipped: UpgradeSkipped[] }>(
      'POST', '/api/v1/admin/upgrades', data),
  listUpgrades: () => req<UpgradeBatchSummary[]>('GET', '/api/v1/admin/upgrades'),
  getUpgrade: (id: number) => req<UpgradeBatchDetail>('GET', `/api/v1/admin/upgrades/${id}`),
  cancelUpgrade: (id: number) =>
    req<{ id: number; status: UpgradeBatchStatus }>('POST', `/api/v1/admin/upgrades/${id}/cancel`),
  resumeUpgrade: (id: number) =>
    req<{ id: number; status: UpgradeBatchStatus }>('POST', `/api/v1/admin/upgrades/${id}/resume`),

  // ── Invitations ──────────────────────────────────────────────────────────────
  createInvitation: () =>
    req<{ id: number; token: string; expires_at: string }>('POST', '/api/v1/admin/invitations'),
  listInvitations: () => req<Invitation[]>('GET', '/api/v1/admin/invitations'),
  validateInvitation: (token: string) =>
    req<{ valid: boolean; expires_at: string }>('GET', `/api/v1/invitations/${token}`),
  registerViaInvitation: (token: string) =>
    req<{ id: number; unique_id: string; token: string }>('POST', `/api/v1/invitations/${token}/register`),

  // ── Account recovery ─────────────────────────────────────────────────────────
  // Admin issues a 1-hour single-use login link for a user who lost their
  // passkey and delivers the URL out of band. Consuming it revokes all the
  // account's passkeys and sets the vtafarm_user cookie — follow with
  // passkeyRegisterBegin/Complete to give the account a fresh passkey.
  createRecoveryLink: (uniqueId: string) =>
    req<{ token: string; expires_at: string }>('POST', `/api/v1/admin/users/${uniqueId}/recovery-link`),
  validateRecovery: (token: string) =>
    req<{ valid: boolean; expires_at: string }>('GET', `/api/v1/recovery/${token}`),
  consumeRecovery: (token: string) =>
    req<{ id: number; unique_id: string; token: string }>('POST', `/api/v1/recovery/${token}`),

  // ── Signup ───────────────────────────────────────────────────────────────────
  // Creates (or, while it still has no passkey, resumes) the account for this
  // email and sets the vtafarm_user cookie — follow with passkeyRegisterBegin/
  // Complete to make the account reachable.
  signup: (email: string) =>
    req<{ id: number; unique_id: string; token: string }>('POST', '/api/v1/signup', { email }),

  // ── User passkeys ────────────────────────────────────────────────────────────
  passkeyRegisterBegin: () =>
    req<{ publicKey: unknown }>('POST', '/api/v1/user/passkeys/register/begin'),
  passkeyRegisterComplete: (name: string, credential: unknown) =>
    req<{ id: number; name: string }>('POST', `/api/v1/user/passkeys/register/complete?name=${encodeURIComponent(name)}`, credential),
  listPasskeys: () => req<PasskeyRecord[]>('GET', '/api/v1/user/passkeys'),
  deletePasskey: (id: number) => req<null>('DELETE', `/api/v1/user/passkeys/${id}`),
  getMe: () => req<{ id: string; email: string | null; beta_access: boolean; created_at: string }>('GET', '/api/v1/user/me'),

  // ── Setup sessions ───────────────────────────────────────────────────────────
  listImages: (component: 'vta' | 'mediator' | 'dids' | 'vtc' = 'vta') =>
    req<Array<{ tag: string; image: string; latest?: boolean }>>('GET', `/api/v1/setup/images?component=${component}`),
  // Remaining per-mode cluster capacity — the create screen uses this to show
  // "Unavailable" and disable the button before submitting.
  setupAvailability: () => req<SetupAvailability>('GET', '/api/v1/setup/availability'),
  // Environment hostname facts behind every hostname hint. Static per
  // deployment — see useDomainInfo() in portalUtils, which caches it.
  domainInfo: () => req<DomainInfo>('GET', '/api/v1/setup/domain-info'),
  listSessions: () => req<SetupSession[]>('GET', '/api/v1/setup'),
  createSession: (data: {
    mode: SetupMode
    vta_image: string
    vta_name?: string
    admin_did?: string
    portable?: boolean
    pre_rotation_count?: number
    mediator_image?: string
    dids_image?: string
    vtc_image?: string
    vtc_name?: string
    /** A verified custom domain. Omitted → managed. full_stack only. */
    domain_id?: number
    /**
     * Replaces vta_name/vtc_name on a custom domain, where the four labels are
     * fixed and no user-chosen name reaches a hostname. Mutually exclusive
     * with them — sending both is a 400.
     */
    label?: string
  }) => req<{ id: string; status: string; url?: string; urls?: SetupSessionUrls }>('POST', '/api/v1/setup', data),

  // ── Domains ──────────────────────────────────────────────────────────────────
  // A zone the user owns, verified on its own page before any session exists.
  // Every route 404s while CUSTOM_DOMAIN_ENABLED is off on the API.
  listDomains: () => req<Domain[]>('GET', '/api/v1/domains'),
  attachDomain: (domain: string) => req<Domain>('POST', '/api/v1/domains', { domain }),
  // Resolves live and promotes to verified when everything passes, so polling
  // it surfaces a fix made in another tab. Cheap once verified — no lookups.
  getDomain: (id: number) => req<Domain>('GET', `/api/v1/domains/${id}`),
  // A failing check is a 200 with per-record detail, not an error — it's the
  // normal path and must not be rendered as one.
  verifyDomain: (id: number) => req<Domain>('POST', `/api/v1/domains/${id}/verify`),
  deleteDomain: (id: number) => req<null>('DELETE', `/api/v1/domains/${id}`),
  getSession: (id: string) => req<SetupSession>('GET', `/api/v1/setup/${id}`),
  deleteSession: (id: string) => req<null>('DELETE', `/api/v1/setup/${id}`),
  provisionAdmin: (id: string, admin_did: string) =>
    req<{ status: string }>('POST', `/api/v1/setup/${id}/admin`, { admin_did }),
  // Self-service upgrade/downgrade of the caller's own session — the backend
  // only ever matches sessions owned by the authenticated user.
  createSessionUpgrade: (id: string, components: Array<{ component: UpgradeComponent; image: string }>) =>
    req<SessionUpgrade>('POST', `/api/v1/setup/${id}/upgrade`, { components }),
  getSessionUpgrade: (id: string) => req<SessionUpgrade>('GET', `/api/v1/setup/${id}/upgrade`),
  reissueDidsEnroll: (id: string) =>
    req<{ dids_admin_enroll_url: string }>('POST', `/api/v1/setup/${id}/dids/reissue-enroll`),
  ackDidsEnroll: (id: string) =>
    req<{ dids_enroll_used: boolean }>('POST', `/api/v1/setup/${id}/dids/enroll-ack`),
  reissueVtcInstall: (id: string) =>
    req<{ install_url: string; claim_code: string }>('POST', `/api/v1/setup/${id}/vtc/reissue-install`),
  ackVtcInstall: (id: string) =>
    req<{ vtc_install_used: boolean }>('POST', `/api/v1/setup/${id}/vtc/install-ack`),
}
