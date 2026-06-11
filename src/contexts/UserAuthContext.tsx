import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { api, type UserInfo } from '@/lib/api'

interface UserAuthCtx {
  user: UserInfo | null
  loading: boolean
  logout: () => Promise<void>
  setUserSession: (user: UserInfo) => void
}

const UserAuthContext = createContext<UserAuthCtx | null>(null)
const SESSION_KEY = 'cipher-user'

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
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(u)) } catch {}
  }, [])

  const logout = useCallback(async () => {
    await api.userLogout().catch(() => {})
    setUser(null)
    try { localStorage.removeItem(SESSION_KEY) } catch {}
  }, [])

  useEffect(() => {
    const handler = () => {
      setUser(null)
      try { localStorage.removeItem(SESSION_KEY) } catch {}
    }
    window.addEventListener('cipher:unauthorized', handler)
    return () => window.removeEventListener('cipher:unauthorized', handler)
  }, [])

  return (
    <UserAuthContext.Provider value={{ user, loading, logout, setUserSession }}>
      {children}
    </UserAuthContext.Provider>
  )
}

export function useUserAuth(): UserAuthCtx {
  const ctx = useContext(UserAuthContext)
  if (!ctx) throw new Error('useUserAuth must be used inside UserAuthProvider')
  return ctx
}
