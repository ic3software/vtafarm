const _apiUrl = import.meta.env.VITE_API_URL
if (!_apiUrl) throw new Error('VITE_API_URL is not set. Create a .env file with VITE_API_URL=<backend URL>.')
export const API_BASE: string = _apiUrl

export interface SetupSession {
  id: string
  status: 'dns_provisioned' | 'vta_setup_running' | 'vta_setup_complete' | 'provisioning' | 'running' | 'failed'
  mode: 'vta_only' | 'full_stack'
  url?: string
  vta_name?: string
  vta_did?: string
  mediator_did?: string
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
  listAdmins: () => req<AdminRecord[]>('GET', '/api/v1/admins'),
  createAdminEnrollmentToken: () =>
    req<{ enrollment_token: string; enrollment_expires: string }>('POST', '/api/v1/admins'),

  // ── User management ──────────────────────────────────────────────────────────
  listUsers: () => req<User[]>('GET', '/api/v1/users'),

  // ── Invitations ──────────────────────────────────────────────────────────────
  createInvitation: () =>
    req<{ id: number; token: string; expires_at: string }>('POST', '/api/v1/invitations'),
  listInvitations: () => req<Invitation[]>('GET', '/api/v1/invitations'),
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

  // ── Setup sessions ───────────────────────────────────────────────────────────
  listImages: () => req<Array<{ tag: string; image: string }>>('GET', '/api/v1/setup/images'),
  listSessions: () => req<SetupSession[]>('GET', '/api/v1/setup'),
  createSession: (data: {
    mode: 'vta_only' | 'full_stack'
    vta_image: string
    vta_name?: string
    portable?: boolean
    pre_rotation_count?: number
  }) => req<{ id: string; url: string; status: string }>('POST', '/api/v1/setup', data),
  getSession: (id: string) => req<SetupSession>('GET', `/api/v1/setup/${id}`),
  deleteSession: (id: string) => req<null>('DELETE', `/api/v1/setup/${id}`),
  provisionAdmin: (id: string, admin_did: string) =>
    req<{ status: string }>('POST', `/api/v1/setup/${id}/admin`, { admin_did }),
}
