import { useMaintenance } from '@/contexts/maintenance'

export function MaintenanceBanner({ admin = false }: { admin?: boolean }) {
  const { state } = useMaintenance()
  if (!state?.enabled) return null

  return (
    <div className="p-alert alert-warning maintenance-banner" role="status">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
      <div className="grow">
        <p className="alert-title">Maintenance mode is active</p>
        <p className="alert-desc">
          {state.message || (admin
            ? 'User workflows are blocked. Administrative maintenance operations remain available.'
            : 'Changes that start or modify a VTA are temporarily unavailable. You can still view your agents.')}
        </p>
      </div>
    </div>
  )
}
