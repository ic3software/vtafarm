import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
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
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') }
  catch { return null }
}

export function UserAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(readSession)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.listSessions()
      .catch((err: { status?: number }) => {
        if (err.status === 401) {
          setUser(null)
          try { sessionStorage.removeItem(SESSION_KEY) } catch {}
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const login = async (email: string, password: string) => {
    const data = await api.userLogin(email, password)
    setUser(data.user)
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(data.user)) } catch {}
  }

  const logout = async () => {
    await api.userLogout().catch(() => {})
    setUser(null)
    try { sessionStorage.removeItem(SESSION_KEY) } catch {}
  }

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
