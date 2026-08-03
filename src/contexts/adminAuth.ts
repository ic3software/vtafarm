import { createContext, useContext } from 'react'
import { type UserInfo } from '@/lib/api'

// Split out of the provider file so that file exports only a component.
// react-refresh/only-export-components: a module mixing a component with
// anything else loses Fast Refresh — editing it full-reloads the app and
// drops the state you were debugging.

export interface AdminAuthCtx {
  admin: UserInfo | null
  loading: boolean
  logout: () => Promise<void>
  setAdminSession: (admin: UserInfo) => void
}

export const AdminAuthContext = createContext<AdminAuthCtx | null>(null)

export function useAdminAuth(): AdminAuthCtx {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) throw new Error('useAdminAuth must be used inside AdminAuthProvider')
  return ctx
}
