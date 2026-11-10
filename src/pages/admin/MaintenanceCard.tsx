import { useCallback, useEffect, useState } from 'react'
import { api, type MaintenanceOperation, type MaintenanceSnapshot } from '@/lib/api'
import { useMaintenance } from '@/contexts/maintenance'

const REFRESH_MS = 5_000

const operationLabels: Record<string, string> = {
  acl_grant: 'Granting VTA access',
  acl_refresh: 'Refreshing VTA access',
  config_update: 'Applying configuration',
  dids_enroll_reissue: 'Reissuing DID enrollment',
  image_upgrade: 'Image upgrade',
  load_test: 'Load test',
  load_test_create: 'Creating load test',
  load_test_delete: 'Deleting load test',
  mobile_connection: 'Mobile connection',
  placement: 'Workload placement',
  platform_stack_create: 'Creating platform stack',
  pool_claim: 'VTA pool claim',
  pool_cleanup: 'Cleaning VTA pool',
  pool_create: 'Creating VTA pool',
  pool_inventory: 'Adding VTA pool inventory',
  resource_update: 'Updating resources',
  trust_registry: 'Trust Registry setup',
  vta_create: 'Creating VTA',
  vta_delete: 'Deleting VTA',
  vta_provision: 'Provisioning VTA',
  vta_recovery: 'Recovering VTA',
  vta_workflow: 'VTA workflow',
  vtc_install_reissue: 'Reissuing VTC install',
}

function operationLabel(operation: MaintenanceOperation): string {
  return operationLabels[operation.operation_type] ?? operation.operation_type.replaceAll('_', ' ')
}

function elapsed(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

export function MaintenanceCard() {
  const { refresh: refreshPublicState } = useMaintenance()
  const [snapshot, setSnapshot] = useState<MaintenanceSnapshot | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setSnapshot(await api.adminMaintenanceStatus())
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load maintenance status')
    }
  }, [])

  useEffect(() => {
    const initial = setTimeout(() => void load(), 0)
    const interval = setInterval(() => void load(), REFRESH_MS)
    return () => {
      clearTimeout(initial)
      clearInterval(interval)
    }
  }, [load])

  async function toggle() {
    if (!snapshot) return
    const enabling = !snapshot.enabled
    const prompt = enabling
      ? 'Enable maintenance mode? New user workflows will be blocked.'
      : 'Disable maintenance mode? Users will be able to start workflows again.'
    if (!window.confirm(prompt)) return
    setBusy(true)
    setError('')
    try {
      const next = await api.setMaintenanceMode(enabling, enabling ? message : '')
      setSnapshot(next)
      if (!enabling) setMessage('')
      await refreshPublicState()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update maintenance mode')
      await load()
    } finally {
      setBusy(false)
    }
  }

  const operations = snapshot?.active_operations ?? []
  const transitionBlocked = operations.length > 0

  return (
    <div className="p-card" style={{ marginBottom: 24 }}>
      <div className="card-header">
        <div className="p-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 className="card-title">Maintenance mode</h3>
            <p className="card-desc">
              Blocks user workflows while keeping the portal and administrative maintenance available.
            </p>
          </div>
          <span className={`p-badge ${snapshot?.enabled ? 'badge-warning' : 'badge-success'}`}>
            {snapshot?.enabled ? 'Enabled' : 'Off'}
          </span>
        </div>
      </div>
      <div className="card-content p-col gap-12">
        {!snapshot && !error && <p className="p-muted">Loading maintenance status…</p>}
        {snapshot && operations.length > 0 && (
          <div className="p-alert alert-warning">
            <div className="grow">
              <p className="alert-title">
                {operations.length} operation{operations.length === 1 ? '' : 's'} still in progress
              </p>
              <p className="alert-desc">Wait for these operations to finish before changing maintenance mode.</p>
              <ul className="maintenance-operation-list">
                {operations.map((operation, index) => (
                  <li key={`${operation.operation_type}-${operation.target}-${operation.started_at}-${index}`}>
                    <span>{operationLabel(operation)}</span>
                    {operation.target && <span className="p-mono">{operation.target}</span>}
                    <span className="p-muted">{elapsed(operation.started_at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {snapshot && operations.length === 0 && (
          <div className="p-alert alert-success">
            <div className="grow">
              <p className="alert-title">No operations are currently running</p>
              <p className="alert-desc">The maintenance mode state can be changed safely.</p>
            </div>
          </div>
        )}
        {snapshot && !snapshot.enabled && (
          <div>
            <label className="p-label" htmlFor="maintenance-message">Message shown to users</label>
            <input
              id="maintenance-message"
              className="p-input"
              maxLength={500}
              value={message}
              onChange={event => setMessage(event.target.value)}
              placeholder="Platform maintenance is in progress."
            />
          </div>
        )}
        {error && <p className="text-sm" style={{ color: 'hsl(var(--destructive))', margin: 0 }}>{error}</p>}
      </div>
      <div className="card-footer" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-outline" onClick={() => void load()} disabled={busy}>Refresh</button>
        <button
          className={`btn ${snapshot?.enabled ? 'btn-outline' : 'btn-default'}`}
          onClick={() => void toggle()}
          disabled={!snapshot || busy || transitionBlocked}
          title={transitionBlocked ? 'Wait for active operations to finish' : undefined}
        >
          {busy ? 'Updating…' : snapshot?.enabled ? 'Disable maintenance mode' : 'Enable maintenance mode'}
        </button>
      </div>
    </div>
  )
}
