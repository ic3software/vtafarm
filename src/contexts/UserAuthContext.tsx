import { useState, useCallback, useEffect, type ReactNode } from 'react'
import { api, type UserInfo } from '@/lib/api'
import { UserAuthContext } from './userAuth'

const SESSION_KEY = 'vtafarm-user'

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

export function UserAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(readSession)
  const loading = false

  const setUserSession = useCallback((u: UserInfo) => {
    setUser(u)
    // Storage can be unavailable (private mode, quota). The cookie is what
    // actually authenticates — losing this cache only costs a re-read.
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(u)) } catch { /* not cached */ }
  }, [])

  const logout = useCallback(async () => {
    await api.userLogout().catch(() => {})
    setUser(null)
    try { localStorage.removeItem(SESSION_KEY) } catch { /* nothing cached */ }
  }, [])

  useEffect(() => {
    const handler = () => {
      setUser(null)
      try { localStorage.removeItem(SESSION_KEY) } catch { /* nothing cached */ }
    }
    window.addEventListener('vtafarm:unauthorized', handler)
    return () => window.removeEventListener('vtafarm:unauthorized', handler)
  }, [])

  return (
    <UserAuthContext.Provider value={{ user, loading, logout, setUserSession }}>
      {children}
    </UserAuthContext.Provider>
  )
}

