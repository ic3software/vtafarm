const _apiUrl = import.meta.env.VITE_API_URL
if (!_apiUrl) throw new Error('VITE_API_URL is not set. Create a .env file with VITE_API_URL=<backend URL>.')
export const API_BASE: string = _apiUrl

export interface SetupSession {
  id: number
  status: 'dns_provisioned' | 'vta_setup_running' | 'vta_setup_complete' | 'provisioning' | 'running' | 'failed'
  mode: 'vta_only' | 'full_stack'
  fqdn?: string
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
  email: string
  role: 'user' | 'admin'
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
  if (!res.ok) throw apiError(data.error ?? 'Request failed', res.status)
  return data as T
}

export const api = {
  userLogin: (email: string, password: string) =>
    req<{ token: string; user: UserInfo }>('POST', '/api/v1/auth/user/login', { email, password }),
  userLogout: () => req<null>('POST', '/api/v1/auth/user/logout'),

  adminLogin: (email: string, password: string) =>
    req<{ token: string; user: UserInfo }>('POST', '/api/v1/auth/admin/login', { email, password }),
  adminLogout: () => req<null>('POST', '/api/v1/auth/admin/logout'),

  createUser: (email: string, password: string) =>
    req<{ id: number; unique_id: string; email: string }>('POST', '/api/v1/users', { email, password }),
  changeAdminPassword: (current_password: string, new_password: string) =>
    req<{ message: string }>('PUT', '/api/v1/admin/password', { current_password, new_password }),
  changeUserPassword: (current_password: string, new_password: string) =>
    req<{ message: string }>('PUT', '/api/v1/user/password', { current_password, new_password }),
  resetUserPassword: (id: number, new_password: string) =>
    req<{ message: string }>('PUT', `/api/v1/users/${id}/password`, { new_password }),

  listImages: () => req<Array<{ tag: string; image: string }>>('GET', '/api/v1/setup/images'),
  listSessions: () => req<SetupSession[]>('GET', '/api/v1/setup'),
  createSession: (data: {
    mode: 'vta_only' | 'full_stack'
    vta_image: string
    vta_name?: string
    portable?: boolean
    pre_rotation_count?: number
  }) => req<{ id: number; subdomain: string; url: string; status: string }>('POST', '/api/v1/setup', data),
  getSession: (id: number) => req<SetupSession>('GET', `/api/v1/setup/${id}`),
  deleteSession: (id: number) => req<null>('DELETE', `/api/v1/setup/${id}`),
  provisionAdmin: (id: number, admin_did: string) =>
    req<{ status: string }>('POST', `/api/v1/setup/${id}/admin`, { admin_did }),
}
