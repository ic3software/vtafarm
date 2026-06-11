import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { api, type UserInfo } from '@/lib/api'

interface UserAuthCtx {
  user: UserInfo | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const UserAuthContext = createContext<UserAuthCtx | null>(null)
const SESSION_KEY = 'cipher-user'

function readSession(): UserInfo | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') }
  catch { return null }
}

export function UserAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(readSession)
  // Auth state comes from localStorage synchronously — no API call needed on mount.
  // loading is kept in the interface for consumers but is always false.
  const loading = false

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.userLogin(email, password)
    setUser(data.user)
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(data.user)) } catch {}
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
    <UserAuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </UserAuthContext.Provider>
  )
}

export function useUserAuth(): UserAuthCtx {
  const ctx = useContext(UserAuthContext)
  if (!ctx) throw new Error('useUserAuth must be used inside UserAuthProvider')
  return ctx
}
