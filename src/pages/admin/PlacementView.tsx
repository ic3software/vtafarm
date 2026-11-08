import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  api,
  type PlacementOverview,
  type PlacementPlan,
  type PlacementPlanItem,
  type PlacementPlanKind,
  type PlacementPreviewItem,
} from '@/lib/api'

const REFRESH_MS = 10_000

function fmtBytes(bytes: number): string {
  const gi = bytes / 2 ** 30
  return gi >= 1 ? `${gi.toFixed(1)} GiB` : `${Math.round(bytes / 2 ** 20)} MiB`
}

function memoryPercent(used: number, requested: number, reserved: number, total: number): number {
  return total > 0 ? Math.round((Math.max(used, requested) + reserved) * 100 / total) : 0
}

export function PlacementView() {
  const [overview, setOverview] = useState<PlacementOverview | null>(null)
  const [plans, setPlans] = useState<PlacementPlan[]>([])
  const [targets, setTargets] = useState<Record<number, string>>({})
  const [preview, setPreview] = useState<PlacementPreviewItem[]>([])
  const [previewKind, setPreviewKind] = useState<PlacementPlanKind | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [nextOverview, nextPlans] = await Promise.all([
        api.placementOverview(),
        api.listPlacementPlans(),
      ])
      setOverview(nextOverview)
      setPlans(nextPlans.plans)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workload placement')
    }
  }, [])

  useEffect(() => {
	const initial = window.setTimeout(() => void load(), 0)
    const timer = window.setInterval(() => void load(), REFRESH_MS)
	return () => {
	  window.clearTimeout(initial)
	  window.clearInterval(timer)
	}
  }, [load])

  const selectedItems = useMemo<PlacementPlanItem[]>(() => Object.entries(targets)
    .filter(([, target]) => target !== '')
    .map(([sessionID, targetNode]) => ({ session_id: Number(sessionID), target_node: targetNode })), [targets])

  async function buildPreview(kind: PlacementPlanKind) {
    if (kind === 'relocate' && selectedItems.length === 0) {
      setError('Choose at least one VTA and its target node first.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await api.previewPlacement(kind, kind === 'relocate' ? selectedItems : [], kind === 'reconcile')
      setPreview(result.items)
      setPreviewKind(kind)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate placement report')
    } finally {
      setBusy(false)
    }
  }

  async function applyPreview() {
    if (!previewKind || preview.some(item => !item.allowed)) return
    setBusy(true)
    setError('')
    try {
      await api.createPlacementPlan(
        previewKind,
        previewKind === 'relocate' ? preview.map(item => ({ session_id: item.session_id, target_node: item.target_node })) : [],
        previewKind === 'reconcile',
      )
      setPreview([])
      setPreviewKind(null)
      setTargets({})
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start placement plan')
    } finally {
      setBusy(false)
    }
  }

  async function cancelPlan(planID: number) {
    setBusy(true)
    setError('')
    try {
      await api.cancelPlacementPlan(planID)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel placement plan')
    } finally {
      setBusy(false)
    }
  }

  async function retryTask(planID: number, taskID: number) {
    setBusy(true)
    setError('')
    try {
      await api.retryPlacementTask(planID, taskID)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not retry placement task')
    } finally {
      setBusy(false)
    }
  }

  async function rollbackTask(planID: number, taskID: number) {
	setBusy(true)
	setError('')
	try {
	  await api.rollbackPlacementTask(planID, taskID)
	  await load()
	} catch (err) {
	  setError(err instanceof Error ? err.message : 'Could not restore the saved Deployment')
	} finally {
	  setBusy(false)
	}
  }

  return (
    <section className="p-content">
      <div className="page-head">
        <div>
          <h1>Workload placement</h1>
          <p className="sub">Review first, then move one VTA at a time with PVC identity verification.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" disabled={busy || !overview} onClick={() => void buildPreview('reconcile')}>
            Preview all
          </button>
          <button className="btn btn-primary btn-sm" disabled={busy || selectedItems.length === 0} onClick={() => void buildPreview('relocate')}>
            Preview selected
          </button>
        </div>
      </div>

      {overview && (
        <p style={{ margin: '0 0 16px', fontSize: 13 }}>
          Activation mode: <span className={`p-badge ${overview.mode === 'enabled' ? 'badge-success' : overview.mode === 'canary' ? 'badge-warning' : 'badge-secondary'}`}>{overview.mode}</span>
          {overview.mode === 'disabled' && ' — reports are available, but apply is blocked.'}
        </p>
      )}
      {error && <p style={{ color: 'hsl(var(--destructive))', fontSize: 13 }}>{error}</p>}

      <div className="dash-grid cols-3" style={{ marginBottom: 20 }}>
        {overview?.nodes.map(node => {
          const percent = memoryPercent(node.memory_used_bytes, node.memory_requested_bytes, node.memory_reserved_bytes, node.memory_allocatable_bytes)
          return (
            <div className="stat" key={node.name}>
              <div className="k">
                <span style={{ fontFamily: 'var(--mono)' }}>{node.name}</span>
                <span className={`p-badge ${node.eligible ? 'badge-success' : 'badge-warning'}`}>{node.memory_state || 'unknown'}</span>
              </div>
              <div className="v">{percent}% <small>memory occupied</small></div>
              <p className="stat-foot">
                {node.vta_only_pods} VTA pods · {fmtBytes(node.memory_reserved_bytes)} reserved
                {!node.metrics_available && ' · metrics unavailable'}
              </p>
            </div>
          )
        })}
      </div>

      <div className="p-card" style={{ marginBottom: 20 }}>
        <div className="card-head"><div><h2>VTA-only workloads</h2><p>Choose an exact eligible destination node.</p></div></div>
        <div className="table-wrap">
          <table className="p-table">
            <thead><tr><th>VTA</th><th>Current node</th><th>Status</th><th>Storage</th><th>Target node</th></tr></thead>
            <tbody>
              {overview?.workloads.map(workload => (
                <tr key={workload.session_id}>
                  <td><strong>{workload.vta_name || `Session ${workload.session_id}`}</strong><br/><span className="mono">#{workload.session_id}</span></td>
                  <td className="mono">{workload.node_name || 'Unscheduled'}</td>
                  <td><span className={`p-badge ${workload.ready ? 'badge-success' : 'badge-warning'}`}>{workload.gated ? 'gated' : workload.ready ? 'ready' : 'not ready'}</span></td>
                  <td>
                    {workload.storage.longhorn_robustness || 'unknown'} · {workload.storage.longhorn_state || 'unknown'}
                    <br/><span className="mono">{workload.storage.last_backup_at ? `backup ${new Date(workload.storage.last_backup_at).toLocaleString()}` : 'no completed backup reported'}</span>
                  </td>
                  <td>
                    <select
                      className="p-input"
                      value={targets[workload.session_id] ?? ''}
                      onChange={event => {
                        setTargets(current => ({ ...current, [workload.session_id]: event.target.value }))
                        setPreview([])
                        setPreviewKind(null)
                      }}
                      aria-label={`Target node for ${workload.vta_name}`}
                    >
                      <option value="">Do not move</option>
                      {overview.nodes.filter(node => node.eligible && node.metrics_available).map(node => (
                        <option key={node.name} value={node.name}>{node.name} · {node.memory_state}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {overview?.workloads.length === 0 && <tr><td colSpan={5}>No VTA-only workloads found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {previewKind && (
        <div className="p-card" style={{ marginBottom: 20 }}>
          <div className="card-head">
            <div><h2>Placement report</h2><p>No Pod has been moved. Review every row before applying.</p></div>
            <button className="btn btn-primary btn-sm" disabled={busy || overview?.mode === 'disabled' || preview.some(item => !item.allowed)} onClick={() => void applyPreview()}>
              Apply reviewed plan
            </button>
          </div>
          <div className="table-wrap">
            <table className="p-table">
              <thead><tr><th>VTA</th><th>From</th><th>To</th><th>Projected memory</th><th>Decision</th></tr></thead>
              <tbody>{preview.map(item => (
                <tr key={item.session_id}>
                  <td>{item.vta_name || `Session ${item.session_id}`}</td>
                  <td className="mono">{item.source_node || 'Unscheduled'}</td>
                  <td className="mono">{item.target_node || 'None'}</td>
                  <td>{item.projected_memory_percent}%</td>
                  <td><span className={`p-badge ${item.allowed ? 'badge-success' : 'badge-warning'}`}>{item.allowed ? 'allowed' : item.reason}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      <div className="p-card">
        <div className="card-head"><div><h2>Recent plans</h2><p>Durable worker progress and failures.</p></div></div>
        <div className="table-wrap">
          <table className="p-table">
            <thead><tr><th>ID</th><th>Kind</th><th>Status</th><th>Tasks</th><th>Created</th><th>Error</th><th></th></tr></thead>
            <tbody>{plans.map(plan => (
              <tr key={plan.id}>
                <td>#{plan.id}</td>
                <td>{plan.kind}</td>
                <td><span className="p-badge badge-secondary">{plan.status}</span></td>
                <td>{plan.tasks?.map(task => `#${task.session_id}: ${task.state}`).join(', ') || '—'}</td>
                <td>{new Date(plan.created_at).toLocaleString()}</td>
                <td>{plan.error_msg || '—'}</td>
                <td className="col-actions">
                  {plan.status === 'running' && plan.kind !== 'provision' && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void cancelPlan(plan.id)}>Cancel</button>}
                  {plan.status === 'paused' && plan.tasks?.filter(task => task.state === 'failed').map(task => (
                    <span key={task.id} style={{ display: 'inline-flex', gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void retryTask(plan.id, task.id)}>Retry #{task.session_id}</button>
                      {plan.kind !== 'provision' && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void rollbackTask(plan.id, task.id)}>Restore</button>}
                    </span>
                  ))}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
