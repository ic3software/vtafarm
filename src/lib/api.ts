const _apiUrl = import.meta.env.VITE_API_URL
if (!_apiUrl) throw new Error('VITE_API_URL is not set. Create a .env file with VITE_API_URL=<backend URL>.')
export const API_BASE: string = _apiUrl

export type SetupStatus =
  // vta_only
  | 'dns_provisioned' | 'vta_setup_running' | 'vta_setup_complete' | 'provisioning' | 'running'
  // full_stack
  | 'dns_provision' | 'env_provision' | 'k8s_provision' | 'step_vta_setup'
  | 'step_mediator_p1' | 'step_mediator_reprov' | 'step_mediator_p2'
  | 'step_dids_p1' | 'step_dids_provision' | 'step_dids_p2' | 'step_dids_invite'
  | 'step_dids_load_did' | 'deploy_dids' | 'deploy_mediator'
  | 'step_vta_register_dids' | 'awaiting_admin_did' | 'step_import_admin_did' | 'deploy_vta'
  // full_stack_with_vtc
  | 'step_vtc_setup_key' | 'step_vtc_acl_grant' | 'step_vtc_setup' | 'deploy_vtc'
  // shared
  | 'failed'

export type SetupMode = 'vta_only' | 'full_stack' | 'full_stack_with_vtc'

export interface SetupSessionUrls {
  vta: string
  mediator: string
  dids: string
  vtc?: string
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
  url?: string
  urls?: SetupSessionUrls
  vta_name?: string
  vta_image?: string
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

export interface UserInfo {
  id: number
  unique_id: string
  role: 'user' | 'admin'
}

export interface User {
  id: number
  unique_id: string
  beta_access: boolean
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
  status: SetupStatus
  error_msg?: string
  fqdn: string
  vta_image?: string
  mediator_image?: string
  dids_image?: string
  vtc_image?: string
  created_at: string
}

export interface AdminSessionsPage {
  items: AdminSetupSession[]
  total: number
  page: number
  page_size: number
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
  components: UpgradeComponent[]
  status: UpgradeBatchStatus
  created_at: string
  tasks: UpgradeTaskItem[]
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

  // ── Admin — setup sessions ───────────────────────────────────────────────────
  adminListSessions: (page = 1) =>
    req<AdminSessionsPage>('GET', `/api/v1/admin/setup-sessions?page=${page}`),
  adminListImages: (component: UpgradeComponent = 'vta') =>
    req<Array<{ tag: string; image: string; latest?: boolean }>>('GET', `/api/v1/admin/setup/images?component=${component}`),

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

  // ── User passkeys ────────────────────────────────────────────────────────────
  passkeyRegisterBegin: () =>
    req<{ publicKey: unknown }>('POST', '/api/v1/user/passkeys/register/begin'),
  passkeyRegisterComplete: (name: string, credential: unknown) =>
    req<{ id: number; name: string }>('POST', `/api/v1/user/passkeys/register/complete?name=${encodeURIComponent(name)}`, credential),
  listPasskeys: () => req<PasskeyRecord[]>('GET', '/api/v1/user/passkeys'),
  deletePasskey: (id: number) => req<null>('DELETE', `/api/v1/user/passkeys/${id}`),
  getMe: () => req<{ id: string; beta_access: boolean; created_at: string }>('GET', '/api/v1/user/me'),

  // ── Setup sessions ───────────────────────────────────────────────────────────
  listImages: (component: 'vta' | 'mediator' | 'dids' | 'vtc' = 'vta') =>
    req<Array<{ tag: string; image: string; latest?: boolean }>>('GET', `/api/v1/setup/images?component=${component}`),
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
  }) => req<{ id: string; status: string; url?: string; urls?: SetupSessionUrls }>('POST', '/api/v1/setup', data),
  getSession: (id: string) => req<SetupSession>('GET', `/api/v1/setup/${id}`),
  deleteSession: (id: string) => req<null>('DELETE', `/api/v1/setup/${id}`),
  provisionAdmin: (id: string, admin_did: string) =>
    req<{ status: string }>('POST', `/api/v1/setup/${id}/admin`, { admin_did }),
  reissueDidsEnroll: (id: string) =>
    req<{ dids_admin_enroll_url: string }>('POST', `/api/v1/setup/${id}/dids/reissue-enroll`),
  ackDidsEnroll: (id: string) =>
    req<{ dids_enroll_used: boolean }>('POST', `/api/v1/setup/${id}/dids/enroll-ack`),
  reissueVtcInstall: (id: string) =>
    req<{ install_url: string; claim_code: string }>('POST', `/api/v1/setup/${id}/vtc/reissue-install`),
  ackVtcInstall: (id: string) =>
    req<{ vtc_install_used: boolean }>('POST', `/api/v1/setup/${id}/vtc/install-ack`),
}
