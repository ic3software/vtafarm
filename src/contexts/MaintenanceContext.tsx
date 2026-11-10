import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { api, type MaintenanceState } from '@/lib/api'
import { MaintenanceContext } from './maintenance'

const REFRESH_MS = 15_000

export function MaintenanceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MaintenanceState | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      setState(await api.maintenanceStatus())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh().catch(() => {})
    const interval = setInterval(() => void refresh().catch(() => {}), REFRESH_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh().catch(() => {})
    }
    const onMaintenance = () => void refresh().catch(() => {})
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('vtafarm:maintenance', onMaintenance)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('vtafarm:maintenance', onMaintenance)
    }
  }, [refresh])

  return (
    <MaintenanceContext.Provider value={{ state, loading, refresh }}>
      {children}
    </MaintenanceContext.Provider>
  )
}
