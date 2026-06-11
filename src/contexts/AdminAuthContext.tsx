import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { api, type UserInfo } from '@/lib/api'

interface AdminAuthCtx {
  admin: UserInfo | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AdminAuthContext = createContext<AdminAuthCtx | null>(null)
const SESSION_KEY = 'cipher-admin'

function readSession(): UserInfo | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') }
  catch { return null }
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<UserInfo | null>(readSession)
  const loading = false

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.adminLogin(email, password)
    setAdmin(data.user)
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(data.user)) } catch {}
  }, [])

  const logout = useCallback(async () => {
    await api.adminLogout().catch(() => {})
    setAdmin(null)
    try { localStorage.removeItem(SESSION_KEY) } catch {}
  }, [])

  useEffect(() => {
    const handler = () => {
      setAdmin(null)
      try { localStorage.removeItem(SESSION_KEY) } catch {}
    }
    window.addEventListener('cipher:unauthorized', handler)
    return () => window.removeEventListener('cipher:unauthorized', handler)
  }, [])

  return (
    <AdminAuthContext.Provider value={{ admin, loading, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  )
}

export function useAdminAuth(): AdminAuthCtx {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) throw new Error('useAdminAuth must be used inside AdminAuthProvider')
  return ctx
}
