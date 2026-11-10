import { createContext, useContext } from 'react'
import type { MaintenanceState } from '@/lib/api'

export interface MaintenanceCtx {
  state: MaintenanceState | null
  loading: boolean
  refresh: () => Promise<void>
}

export const MaintenanceContext = createContext<MaintenanceCtx | null>(null)

export function useMaintenance(): MaintenanceCtx {
  const ctx = useContext(MaintenanceContext)
  if (!ctx) throw new Error('useMaintenance must be used inside MaintenanceProvider')
  return ctx
}
