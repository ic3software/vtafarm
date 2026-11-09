import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  CircleGauge,
  Info,
  ListChecks,
  LoaderCircle,
  MoveRight,
  RotateCcw,
  Search,
  Server,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { pageNumbers } from '@/lib/utils'
import {
  api,
  type PlacementNode,
  type PlacementOverview,
  type PlacementPlan,
  type PlacementPlanItem,
  type PlacementPlanKind,
  type PlacementPreviewItem,
} from '@/lib/api'

const REFRESH_MS = 10_000
const NO_TARGET = '__no_target__'
const ALL_FILTER = '__all__'
const PAGE_SIZE = 25
const PLAN_PAGE_SIZE = 10

function fmtBytes(bytes: number): string {
  const gi = bytes / 2 ** 30
  return gi >= 1 ? `${gi.toFixed(1)} GiB` : `${Math.round(bytes / 2 ** 20)} MiB`
}

function memoryPercent(used: number, requested: number, reserved: number, total: number): number {
  return total > 0 ? Math.round((Math.max(used, requested) + reserved) * 100 / total) : 0
}

function nodeMemoryPercent(node: PlacementNode): number {
  return memoryPercent(
    node.memory_used_bytes,
    node.memory_requested_bytes,
    node.memory_reserved_bytes,
    node.memory_allocatable_bytes,
  )
}

function nodeState(node: PlacementNode) {
  if (!node.metrics_available) {
    return {
      label: 'Metrics unavailable',
      badge: 'badge-secondary',
      meter: 'unknown',
    }
  }

  switch (node.memory_state) {
    case 'green':
      return { label: 'Healthy', badge: 'badge-success', meter: 'healthy' }
    case 'yellow':
      return { label: 'Elevated', badge: 'badge-warning', meter: 'warning' }
    case 'orange':
      return { label: 'High', badge: 'badge-warning', meter: 'critical' }
    case 'hot':
      return { label: 'Hot', badge: 'badge-destructive', meter: 'critical' }
    default:
      return {
        label: 'Not classified',
        badge: 'badge-secondary',
        meter: 'unknown',
      }
  }
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ')
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function summarizeTasks(tasks: NonNullable<PlacementPlan['tasks']>) {
  return tasks.reduce((summary, task) => {
    if (task.state === 'completed') summary.completed += 1
    else if (task.state === 'requested') summary.queued += 1
    else if (task.state === 'failed') summary.failed += 1
    else if (task.state === 'cancelled' || task.state === 'rolled_back') summary.stopped += 1
    else summary.active += 1
    return summary
  }, { completed: 0, queued: 0, active: 0, failed: 0, stopped: 0 })
}

export function PlacementView() {
  const [overview, setOverview] = useState<PlacementOverview | null>(null)
  const [plans, setPlans] = useState<PlacementPlan[]>([])
  const [targets, setTargets] = useState<Record<number, string>>({})
  const [preview, setPreview] = useState<PlacementPreviewItem[]>([])
  const [previewKind, setPreviewKind] = useState<PlacementPlanKind | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [nodeFilter, setNodeFilter] = useState(ALL_FILTER)
  const [page, setPage] = useState(1)
  const [planPage, setPlanPage] = useState(1)
  const [planTotal, setPlanTotal] = useState(0)
  const [hasRunningPlan, setHasRunningPlan] = useState(false)
  const [expandedPlans, setExpandedPlans] = useState<Set<number>>(() => new Set())

  const load = useCallback(async (requestedPlanPage = planPage) => {
    try {
      const [nextOverview, nextPlans] = await Promise.all([
        api.placementOverview(),
        api.listPlacementPlans(requestedPlanPage, PLAN_PAGE_SIZE),
      ])
      setOverview(nextOverview)
      setPlans(nextPlans.plans)
      setPlanTotal(nextPlans.total)
      setHasRunningPlan(nextPlans.has_running_plan)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workload placement')
    } finally {
      setLoading(false)
    }
  }, [planPage])

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    const poll = async () => {
      await load()
      if (!cancelled) timer = window.setTimeout(() => void poll(), REFRESH_MS)
    }
    void poll()
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [load])

  const selectedItems = useMemo<PlacementPlanItem[]>(() => Object.entries(targets)
    .filter(([, target]) => target !== '')
    .map(([sessionID, targetNode]) => ({ session_id: Number(sessionID), target_node: targetNode })), [targets])

  const eligibleNodes = useMemo(() => overview?.nodes.filter(node => (
    node.eligible && node.metrics_available && node.memory_state !== 'hot'
  )) ?? [], [overview])

  const filteredWorkloads = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return overview?.workloads.filter(workload => {
      const matchesQuery = normalizedQuery === '' || [
        workload.vta_name,
        String(workload.session_id),
        workload.node_name,
        workload.storage.longhorn_state,
        workload.storage.longhorn_robustness,
      ].some(value => value?.toLowerCase().includes(normalizedQuery))
      const matchesNode = nodeFilter === ALL_FILTER
        || (nodeFilter === 'unscheduled' ? !workload.node_name : workload.node_name === nodeFilter)
      return matchesQuery && matchesNode
    }) ?? []
  }, [nodeFilter, overview, query])

  const pageCount = Math.max(1, Math.ceil(filteredWorkloads.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const visibleWorkloads = filteredWorkloads.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

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
      setPlanPage(1)
      await load(1)
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

  function togglePlanDetails(planID: number) {
    setExpandedPlans(current => {
      const next = new Set(current)
      if (next.has(planID)) next.delete(planID)
      else next.add(planID)
      return next
    })
  }

  if (!overview) {
    return (
      <section className="p-content placement-page">
        <div className="page-head">
          <div>
            <h1>Workload placement</h1>
            <p className="sub">Review cluster headroom and safely move VTA-only workloads to an exact node.</p>
          </div>
        </div>

        <div className="p-card placement-cluster-loading" role={loading ? 'status' : 'alert'}>
          <div className="placement-loading-icon">
            {loading ? <LoaderCircle className="placement-spinner" aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
          </div>
          <h2>{loading ? 'Reading Kubernetes cluster' : 'Could not read the cluster'}</h2>
          <p>
            {loading
              ? 'Fetching nodes, VTA Pods, PVCs, Longhorn volume health, and placement history. Kubernetes may take a few seconds to return the complete snapshot.'
              : error || 'The placement snapshot is unavailable. Try again in a moment.'}
          </p>
          {!loading && (
            <Button
              variant="outline"
              onClick={() => {
                setLoading(true)
                void load()
              }}
            >
              <RotateCcw aria-hidden="true" />
              Try again
            </Button>
          )}
        </div>
      </section>
    )
  }

  const mode = overview.mode
  const planPageCount = Math.max(1, Math.ceil(planTotal / PLAN_PAGE_SIZE))
  const modeCopy = mode === 'canary'
      ? { title: 'Canary mode', description: 'Only allowlisted VTA sessions can be moved. Cluster-wide plans cannot be applied.', className: 'alert-info' }
      : { title: 'Preview-only mode', description: 'You can generate placement reports, but applying a plan is disabled by configuration.', className: 'alert-warning' }

  return (
    <section className="p-content placement-page">
      <div className="page-head">
        <h1>Workload placement</h1>
      </div>

      {mode !== 'enabled' && (
        <div className={`p-alert placement-mode-alert ${modeCopy.className}`}>
          {mode === 'canary' ? <Info aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
          <div className="grow">
            <div className="placement-alert-title-row">
              <p className="alert-title">{modeCopy.title}</p>
              <span className={`p-badge ${mode === 'canary' ? 'badge-default' : 'badge-secondary'}`}>{mode}</span>
            </div>
            <p className="alert-desc">{modeCopy.description}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-alert alert-destructive" role="alert">
          <AlertTriangle aria-hidden="true" />
          <div className="grow">
            <p className="alert-title">Placement request failed</p>
            <p className="alert-desc">{error}</p>
          </div>
        </div>
      )}

      <section className="placement-section" aria-labelledby="placement-nodes-title">
        <div className="placement-section-heading">
          <h2 id="placement-nodes-title">Cluster nodes</h2>
          <div className="placement-node-legend" aria-label="Node placement states">
            <span><i className="healthy" />Healthy <em>preferred</em></span>
            <span><i className="elevated" />Elevated <em>reduced headroom</em></span>
            <span><i className="high" />High <em>near hot</em></span>
            <span><i className="hot" />Hot <em>blocked</em></span>
          </div>
        </div>

        <div className="placement-node-grid">
          {overview.nodes.map(node => {
            const percent = nodeMemoryPercent(node)
            const state = nodeState(node)
            return (
              <article className="p-card placement-node-card" key={node.name}>
                <div className="placement-node-head">
                  <div className="placement-node-name">
                    <Server aria-hidden="true" />
                    <span className="p-mono">{node.name}</span>
                  </div>
                  <span className={`p-badge ${state.badge}`}>{state.label}</span>
                </div>
                <div className="placement-memory-value">
                  <strong>{percent}%</strong>
                  <span>memory occupied</span>
                </div>
                <div className={`placement-memory-track ${state.meter}`} role="progressbar" aria-label={`${node.name} memory occupied`} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
                  <span style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }} />
                </div>
                <div className="placement-node-stats">
                  <span><strong>{node.vta_only_pods}</strong> VTA pods</span>
                  <span><strong>{fmtBytes(node.memory_reserved_bytes)}</strong> reserved</span>
                </div>
                <div className={`placement-eligibility ${node.eligible && node.metrics_available ? 'eligible' : ''}`}>
                  <span className="placement-status-dot" aria-hidden="true" />
                  {node.eligible && node.metrics_available ? 'Eligible destination' : 'Not eligible for placement'}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <div className="p-card placement-card">
        <div className="card-header placement-workload-header">
          <h2 className="card-title">VTA-only workloads</h2>
        </div>
        <div className="placement-plan-options">
          <div className="placement-plan-option">
            <div>
              <strong>Manual placement</strong>
              <span>{hasRunningPlan ? 'Available after the current placement plan finishes.' : 'Choose target nodes in the table, then review your changes.'}</span>
            </div>
            <Button
              variant="outline"
              disabled={busy || hasRunningPlan || selectedItems.length === 0}
              onClick={() => void buildPreview('relocate')}
              title={hasRunningPlan ? 'Wait for the running placement plan to finish' : 'Review only the workloads and exact destination nodes selected below'}
            >
              {busy ? <LoaderCircle className="placement-spinner" aria-hidden="true" /> : <MoveRight aria-hidden="true" />}
              Review selected{selectedItems.length > 0 ? ` (${selectedItems.length})` : ''}
            </Button>
          </div>
          <div className="placement-plan-option">
            <div>
              <strong>Recommended placement</strong>
              <span>{hasRunningPlan ? 'Available after the current placement plan finishes.' : 'Let VTA Farm choose destinations from current node headroom.'}</span>
            </div>
            <Button
              variant="outline"
              disabled={busy || hasRunningPlan || overview.workloads.length === 0}
              onClick={() => void buildPreview('reconcile')}
              title={hasRunningPlan ? 'Wait for the running placement plan to finish' : 'Recommend the safest eligible node for each running VTA-only workload'}
            >
              {busy ? <LoaderCircle className="placement-spinner" aria-hidden="true" /> : <ListChecks aria-hidden="true" />}
              Review recommendation
            </Button>
          </div>
        </div>
        <div className="placement-filters" aria-label="Workload filters">
          <div className="placement-search">
            <Search aria-hidden="true" />
            <input
              className="p-input"
              type="search"
              placeholder="Search VTA, session ID, node, or storage…"
              value={query}
              onChange={event => {
                setQuery(event.target.value)
                setPage(1)
              }}
              aria-label="Search workloads"
            />
          </div>
          <Select value={nodeFilter} onValueChange={value => {
            setNodeFilter(value)
            setPage(1)
          }}>
            <SelectTrigger className="placement-filter-trigger placement-node-filter" aria-label="Filter by current node">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width)">
              <SelectItem value={ALL_FILTER}>All current nodes</SelectItem>
              <SelectItem value="unscheduled">Unscheduled</SelectItem>
              {overview.nodes.map(node => <SelectItem key={node.name} value={node.name}>{node.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="table-wrap">
          <table className="p-table placement-workload-table">
            <colgroup>
              <col />
              <col />
              <col />
              <col />
              <col className="placement-target-column" />
            </colgroup>
            <thead>
              <tr><th>VTA</th><th>Current node</th><th>Status</th><th>Storage</th><th>Target node</th></tr>
            </thead>
            <tbody>
              {visibleWorkloads.map(workload => {
                const destinations = eligibleNodes.filter(node => node.name !== workload.node_name)
                return (
                  <tr key={workload.session_id}>
                    <td>
                      <strong>{workload.vta_name || `Session ${workload.session_id}`}</strong>
                      <span className="placement-cell-detail p-mono">#{workload.session_id}</span>
                    </td>
                    <td className="p-mono">{workload.node_name || 'Unscheduled'}</td>
                    <td>
                      <span
                        className={`p-badge ${workload.ready && !workload.gated ? 'badge-success' : 'badge-warning'}`}
                        title={workload.gated ? 'Kubernetes scheduling is paused until the placement worker assigns this Pod to an eligible node.' : undefined}
                      >
                        {workload.gated ? 'awaiting placement' : workload.ready ? 'ready' : 'not ready'}
                      </span>
                    </td>
                    <td>
                      <span>{workload.storage.longhorn_robustness || 'Unknown health'} · {workload.storage.longhorn_state || 'Unknown state'}</span>
                      <span className="placement-cell-detail">
                        {workload.storage.last_backup_at ? `Backup ${formatDate(workload.storage.last_backup_at)}` : 'No completed backup reported'}
                      </span>
                    </td>
                    <td>
                      <Select
                        value={targets[workload.session_id] || NO_TARGET}
                        disabled={busy || destinations.length === 0}
                        onValueChange={value => {
                          setTargets(current => ({ ...current, [workload.session_id]: value === NO_TARGET ? '' : value }))
                          setPreview([])
                          setPreviewKind(null)
                        }}
                      >
                        <SelectTrigger className="placement-target-trigger" aria-label={`Target node for ${workload.vta_name || `session ${workload.session_id}`}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper" align="end" className="w-(--radix-select-trigger-width)">
                          <SelectItem value={NO_TARGET}>Do not move</SelectItem>
                          {destinations.map(node => (
                            <SelectItem key={node.name} value={node.name}>
                              <span className="p-mono">{node.name}</span>
                              <span className="placement-select-meta">{nodeMemoryPercent(node)}% used</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {destinations.length === 0 && <span className="placement-cell-detail">No eligible destination</span>}
                    </td>
                  </tr>
                )
              })}
              {filteredWorkloads.length === 0 && (
                <tr><td colSpan={5} className="placement-empty-cell">{overview.workloads.length === 0 ? 'No VTA-only workloads found.' : 'No workloads match these filters.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="placement-pagination">
          <span>Total {filteredWorkloads.length} workload{filteredWorkloads.length === 1 ? '' : 's'}</span>
          <div className="placement-pagination-actions">
            <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage(current => Math.max(1, current - 1))}>
              Previous
            </Button>
            {pageNumbers(currentPage, pageCount).map((pageNumber, index) => pageNumber === '…' ? (
              <span key={`gap-${index}`}>…</span>
            ) : (
              <Button
                key={pageNumber}
                variant={pageNumber === currentPage ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPage(pageNumber)}
              >
                {pageNumber}
              </Button>
            ))}
            <Button variant="outline" size="sm" disabled={currentPage === pageCount} onClick={() => setPage(current => Math.min(pageCount, current + 1))}>
              Next
            </Button>
          </div>
        </div>
      </div>

      {previewKind && (
        <div className="p-card placement-card placement-report-card">
          <div className="card-header with-action">
            <div>
              <div className="placement-title-with-badge">
                <h2 className="card-title">Placement report</h2>
                {preview.length > 0 && (
                  <span className="p-badge badge-secondary">
                    {previewKind === 'reconcile'
                      ? `${preview.length} recommended move${preview.length === 1 ? '' : 's'}`
                      : `${preview.length} selected`}
                  </span>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              disabled={busy || hasRunningPlan || overview?.mode === 'disabled' || preview.length === 0 || preview.some(item => !item.allowed)}
              onClick={() => void applyPreview()}
            >
              {busy ? <LoaderCircle className="placement-spinner" aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
              Apply reviewed plan
            </Button>
          </div>
          <div className="table-wrap">
            <table className="p-table">
              <thead><tr><th>VTA</th><th>From</th><th>To</th><th>Projected memory</th><th>Decision</th></tr></thead>
              <tbody>
                {preview.map(item => (
                  <tr key={item.session_id}>
                    <td><strong>{item.vta_name || `Session ${item.session_id}`}</strong></td>
                    <td className="p-mono">{item.source_node || 'Unscheduled'}</td>
                    <td className="p-mono">{item.target_node || 'None'}</td>
                    <td>{item.projected_memory_percent}%</td>
                    <td><span className={`p-badge ${item.allowed ? 'badge-success' : 'badge-warning'}`}>{item.allowed ? 'allowed' : item.reason}</span></td>
                  </tr>
                ))}
                {preview.length === 0 && (
                  <tr><td colSpan={5} className="placement-empty-cell">No moves recommended. All scheduled VTA workloads are on healthy nodes.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="p-card placement-card">
        <div className="card-header">
          <h2 className="card-title">Recent plans</h2>
        </div>
        <div className="table-wrap">
          <table className="p-table placement-plans-table">
            <thead><tr><th>ID</th><th>Kind</th><th>Status</th><th>Tasks</th><th>Created</th><th>Error</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {plans.map(plan => {
                const tasks = plan.tasks ?? []
                const taskSummary = summarizeTasks(tasks)
                const completedPercent = tasks.length > 0 ? Math.round(taskSummary.completed * 100 / tasks.length) : 0
                const detailsExpanded = expandedPlans.has(plan.id)
                const canCancel = plan.status === 'running'
                  && plan.kind !== 'provision'
                  && taskSummary.queued > 0
                  && taskSummary.active === 0
                return (
                <Fragment key={plan.id}>
                <tr key={plan.id}>
                  <td className="p-mono">#{plan.id}</td>
                  <td>{humanize(plan.kind)}</td>
                  <td>
                    <span className={`p-badge ${plan.status === 'completed' ? 'badge-success' : plan.status === 'paused' ? 'badge-warning' : 'badge-secondary'}`}>
                      {plan.status}
                    </span>
                  </td>
                  <td>
                    {tasks.length === 0 ? '—' : (
                      <div className="placement-task-summary">
                        <div className="placement-task-summary-head">
                          <strong>{taskSummary.completed} of {tasks.length} completed</strong>
                          <span>{completedPercent}%</span>
                        </div>
                        <div className="placement-task-progress" role="progressbar" aria-label={`Plan ${plan.id} completed tasks`} aria-valuenow={taskSummary.completed} aria-valuemin={0} aria-valuemax={tasks.length}>
                          <span style={{ width: `${completedPercent}%` }} />
                        </div>
                        <div className="placement-task-counts">
                          {taskSummary.active > 0 && <span className="p-badge badge-default">{taskSummary.active} in progress</span>}
                          {taskSummary.queued > 0 && <span className="p-badge badge-secondary">{taskSummary.queued} queued</span>}
                          {taskSummary.failed > 0 && <span className="p-badge badge-destructive">{taskSummary.failed} failed</span>}
                          {taskSummary.stopped > 0 && <span className="p-badge badge-secondary">{taskSummary.stopped} stopped</span>}
                        </div>
                        <Button
                          className="placement-task-toggle"
                          variant="ghost"
                          size="sm"
                          aria-expanded={detailsExpanded}
                          onClick={() => togglePlanDetails(plan.id)}
                        >
                          {detailsExpanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
                          {detailsExpanded ? 'Hide task details' : 'View task details'}
                        </Button>
                      </div>
                    )}
                  </td>
                  <td>{formatDate(plan.created_at)}</td>
                  <td className="placement-plan-error">{plan.error_msg || '—'}</td>
                  <td className="col-actions">
                    <div className="placement-row-actions">
                      {canCancel && (
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void cancelPlan(plan.id)}>
                          <X aria-hidden="true" />
                          Cancel
                        </Button>
                      )}
                      {plan.status === 'paused' && plan.tasks?.filter(task => task.state === 'failed').map(task => (
                        <span key={task.id} className="placement-row-actions">
                          <Button variant="outline" size="sm" disabled={busy} onClick={() => void retryTask(plan.id, task.id)}>
                            <CircleGauge aria-hidden="true" />
                            Retry #{task.session_id}
                          </Button>
                          {plan.kind !== 'provision' && (
                            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void rollbackTask(plan.id, task.id)}>
                              <RotateCcw aria-hidden="true" />
                              Restore
                            </Button>
                          )}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
                {detailsExpanded && (
                  <tr className="placement-task-detail-row">
                    <td colSpan={7}>
                      <div className="placement-task-detail-panel">
                        <table className="p-table">
                          <thead>
                            <tr><th>Session</th><th>Source node</th><th>Target node</th><th>State</th><th>Updated</th><th>Error</th></tr>
                          </thead>
                          <tbody>
                            {tasks.map(task => (
                              <tr key={task.id}>
                                <td className="p-mono">#{task.session_id}</td>
                                <td className="p-mono">{task.source_node || '—'}</td>
                                <td className="p-mono">{task.target_node || '—'}</td>
                                <td><span className={`p-badge ${task.state === 'completed' ? 'badge-success' : task.state === 'failed' ? 'badge-destructive' : task.state === 'requested' ? 'badge-secondary' : 'badge-default'}`}>{humanize(task.state)}</span></td>
                                <td>{formatDate(task.updated_at)}</td>
                                <td className="placement-plan-error">{task.error_msg || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
                )
              })}
              {plans.length === 0 && <tr><td colSpan={7} className="placement-empty-cell">No placement plans have run yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="placement-pagination">
          <span>Total {planTotal} plan{planTotal === 1 ? '' : 's'}</span>
          <div className="placement-pagination-actions">
            <Button variant="outline" size="sm" disabled={planPage === 1} onClick={() => setPlanPage(current => Math.max(1, current - 1))}>
              Previous
            </Button>
            {pageNumbers(planPage, planPageCount).map((pageNumber, index) => pageNumber === '…' ? (
              <span key={`plan-gap-${index}`}>…</span>
            ) : (
              <Button
                key={pageNumber}
                variant={pageNumber === planPage ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPlanPage(pageNumber)}
              >
                {pageNumber}
              </Button>
            ))}
            <Button variant="outline" size="sm" disabled={planPage === planPageCount} onClick={() => setPlanPage(current => Math.min(planPageCount, current + 1))}>
              Next
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
