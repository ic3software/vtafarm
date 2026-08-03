import { useState, useCallback, useEffect, type ReactNode } from 'react'
import { api, type UserInfo } from '@/lib/api'
import { AdminAuthContext } from './adminAuth'

const SESSION_KEY = 'vtafarm-admin'

function readSession(): UserInfo | null {
  try {
    const data = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null')
    if (!data || typeof data.unique_id !== 'string') {
      localStorage.removeItem(SESSION_KEY)
      return null
    }
    return data
  } catch { return null }
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<UserInfo | null>(readSession)
  const loading = false

  const setAdminSession = useCallback((a: UserInfo) => {
    setAdmin(a)
    // Storage can be unavailable (private mode, quota). The cookie is what
    // actually authenticates — losing this cache only costs a re-read.
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(a)) } catch { /* not cached */ }
  }, [])

  const logout = useCallback(async () => {
    await api.adminLogout().catch(() => {})
    setAdmin(null)
    try { localStorage.removeItem(SESSION_KEY) } catch { /* nothing cached */ }
  }, [])

  useEffect(() => {
    const handler = () => {
      setAdmin(null)
      try { localStorage.removeItem(SESSION_KEY) } catch { /* nothing cached */ }
    }
    window.addEventListener('vtafarm:unauthorized', handler)
    return () => window.removeEventListener('vtafarm:unauthorized', handler)
  }, [])

  return (
    <AdminAuthContext.Provider value={{ admin, loading, logout, setAdminSession }}>
      {children}
    </AdminAuthContext.Provider>
  )
}

