import { createContext, useContext } from 'react'
import { type UserInfo } from '@/lib/api'

// Split out of the provider file so that file exports only a component.
// react-refresh/only-export-components: a module mixing a component with
// anything else loses Fast Refresh — editing it full-reloads the app and
// drops the state you were debugging.

export interface UserAuthCtx {
  user: UserInfo | null
  loading: boolean
  logout: () => Promise<void>
  setUserSession: (user: UserInfo) => void
}

export const UserAuthContext = createContext<UserAuthCtx | null>(null)

export function useUserAuth(): UserAuthCtx {
  const ctx = useContext(UserAuthContext)
  if (!ctx) throw new Error('useUserAuth must be used inside UserAuthProvider')
  return ctx
}
