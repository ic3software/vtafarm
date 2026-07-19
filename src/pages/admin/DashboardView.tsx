import { useState, useEffect, useCallback } from 'react'
import { api, type AdminDashboard, type DashboardEstimate } from '@/lib/api'

// Matches metrics-server's own ~15s refresh cadence — polling faster just
// re-reads identical numbers.
const REFRESH_MS = 15_000

function fmtCores(millis: number): string {
  const cores = millis / 1000
  return Number.isInteger(cores) ? String(cores) : cores.toFixed(2)
}

function fmtBytes(bytes: number): string {
  const gi = bytes / 2 ** 30
  if (gi >= 10) return `${Math.round(gi)}Gi`
  if (gi >= 1) return `${gi.toFixed(1)}Gi`
  return `${Math.round(bytes / 2 ** 20)}Mi`
}

function pct(num: number, den: number): number {
  return den > 0 ? Math.min(100, Math.round((num / den) * 100)) : 0
}

/** Fill severity: the meter turns warning at 75% and critical at 90%. */
function Meter({ label, num, den, detail, unknown }: {
  label: string
  num: number
  den: number
  /** Absolute reading shown next to the percentage, e.g. "2.59 / 4 cores". */
  detail: string
  unknown?: boolean
}) {
  const p = pct(num, den)
  const cls = unknown ? 'meter' : p >= 90 ? 'meter crit' : p >= 75 ? 'meter warn' : 'meter'
  return (
    <div className={cls}>
      <span className="m-label">{label}</span>
      <div className="m-track">
        <div className="m-fill" style={{ width: `${unknown ? 0 : p}%` }} />
      </div>
      <span className="m-val">{unknown ? '—' : `${p}% · ${detail}`}</span>
    </div>
  )
}

function EstimateCard({ title, est }: { title: string; est: DashboardEstimate }) {
  const rows: Array<{ key: 'cpu' | 'memory' | 'storage'; label: string; value: number }> = [
    { key: 'cpu', label: 'CPU', value: est.by_cpu },
    { key: 'memory', label: 'Memory', value: est.by_memory },
    { key: 'storage', label: 'Storage', value: est.by_storage },
  ]
  const maxValue = Math.max(1, ...rows.map(r => r.value))
  return (
    <div className="stat">
      <div className="k">
        <span>{title}</span>
        <span className="p-badge badge-warning">limited by {est.limiting_resource}</span>
      </div>
      <div className="v">
        +{est.count} <small>more sessions fit</small>
      </div>
      <div className="est-chart">
        {rows.map(r => (
          <div key={r.key} className={r.key === est.limiting_resource ? 'ec-row limiting' : 'ec-row'}>
            <span className="ec-label">{r.label}</span>
            <div className="ec-plot">
              <div className="ec-track">
                {r.value >= 0 && (
                  <div
                    className={r.key === est.limiting_resource ? 'ec-bar limiting' : 'ec-bar'}
                    style={{ width: `${(r.value / maxValue) * 100}%` }}
                  />
                )}
              </div>
              <span className="ec-val">{r.value < 0 ? '—' : r.value}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="stat-foot">
        Per session: {est.cpu_millis_per_session}m CPU · {fmtBytes(est.mem_bytes_per_session)} memory
        {est.storage_bytes_per_session > 0 && ` · ${fmtBytes(est.storage_bytes_per_session)} disk`}.
        Estimated by simulating placement on schedulable nodes.
      </p>
    </div>
  )
}

export function DashboardView() {
  const [data, setData] = useState<AdminDashboard | null>(null)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const load = useCallback(() => {
    api
      .adminDashboard()
      .then(d => {
        setData(d)
        setError('')
        setUpdatedAt(new Date())
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load cluster stats'))
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

  const cpu = data?.cluster.cpu
  const mem = data?.cluster.memory
  const sto = data?.cluster.storage
  // Longhorn's capacity for new replicas = already scheduled + still schedulable.
  const stoCapacity = sto ? sto.scheduled_bytes + sto.schedulable_bytes : 0

  return (
    <section className="p-content">
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="sub">
            Auto-refreshes every {REFRESH_MS / 1000}s
            {updatedAt && ` · updated ${updatedAt.toLocaleTimeString()}`}
          </p>
        </div>
      </div>

      {error && (
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'hsl(var(--destructive))' }}>{error}</p>
      )}

      {!data ? (
        !error && <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>Loading…</p>
      ) : (
        <>
          <div className="dash-grid cols-3">
            <div className="stat">
              <div className="k">
                <span>CPU</span>
                {!data.metrics_available && <span className="p-badge badge-secondary">no live metrics</span>}
              </div>
              {cpu && (
                <>
                  <div className="v">
                    {fmtCores(cpu.allocatable_millis - cpu.requested_millis)}{' '}
                    <small>of {fmtCores(cpu.allocatable_millis)} cores free</small>
                  </div>
                  <Meter
                    label="Requested"
                    num={cpu.requested_millis}
                    den={cpu.allocatable_millis}
                    detail={`${fmtCores(cpu.requested_millis)} / ${fmtCores(cpu.allocatable_millis)} cores`}
                  />
                  <Meter
                    label="Used (live)"
                    num={cpu.used_millis}
                    den={cpu.allocatable_millis}
                    detail={`${fmtCores(cpu.used_millis)} / ${fmtCores(cpu.allocatable_millis)} cores`}
                    unknown={!data.metrics_available}
                  />
                </>
              )}
            </div>

            <div className="stat">
              <div className="k">
                <span>Memory</span>
                {!data.metrics_available && <span className="p-badge badge-secondary">no live metrics</span>}
              </div>
              {mem && (
                <>
                  <div className="v">
                    {fmtBytes(mem.allocatable_bytes - mem.requested_bytes)}{' '}
                    <small>of {fmtBytes(mem.allocatable_bytes)} free</small>
                  </div>
                  <Meter
                    label="Requested"
                    num={mem.requested_bytes}
                    den={mem.allocatable_bytes}
                    detail={`${fmtBytes(mem.requested_bytes)} / ${fmtBytes(mem.allocatable_bytes)}`}
                  />
                  <Meter
                    label="Used (live)"
                    num={mem.used_bytes}
                    den={mem.allocatable_bytes}
                    detail={`${fmtBytes(mem.used_bytes)} / ${fmtBytes(mem.allocatable_bytes)}`}
                    unknown={!data.metrics_available}
                  />
                </>
              )}
            </div>

            <div className="stat">
              <div className="k">
                <span>Storage (Longhorn)</span>
                {data.storage_available && sto && sto.replica_count > 1 && (
                  <span className="p-badge badge-secondary">×{sto.replica_count} replicas</span>
                )}
                {!data.storage_available && <span className="p-badge badge-warning">unavailable</span>}
              </div>
              {data.storage_available && sto ? (
                <>
                  <div className="v">
                    {fmtBytes(sto.schedulable_bytes)}{' '}
                    <small>of {fmtBytes(stoCapacity)} schedulable free</small>
                  </div>
                  <Meter
                    label="Scheduled"
                    num={sto.scheduled_bytes}
                    den={stoCapacity}
                    detail={`${fmtBytes(sto.scheduled_bytes)} / ${fmtBytes(stoCapacity)}`}
                  />
                  <Meter
                    label="Data written"
                    num={sto.data_written_bytes}
                    den={sto.scheduled_bytes}
                    detail={`${fmtBytes(sto.data_written_bytes)} / ${fmtBytes(sto.scheduled_bytes)}`}
                  />
                  <Meter
                    label="Disk used"
                    num={sto.maximum_bytes - sto.available_bytes}
                    den={sto.maximum_bytes}
                    detail={`${fmtBytes(sto.maximum_bytes - sto.available_bytes)} / ${fmtBytes(sto.maximum_bytes)}`}
                  />
                </>
              ) : (
                <p className="stat-foot">
                  Longhorn stats could not be read — storage is not constraining the
                  estimates below.
                </p>
              )}
            </div>
          </div>

          <div className="dash-grid cols-2">
            <EstimateCard title="VTA only" est={data.estimates.vta_only} />
            <EstimateCard title="Full stack" est={data.estimates.full_stack} />
          </div>

          <p className="p-section-title" style={{ margin: '24px 0 10px' }}>Nodes</p>
          <div className="table-wrap">
            <table className="p-table" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ width: '22%' }}>Node</th>
                  <th style={{ width: '13%' }}>Status</th>
                  <th>CPU request</th>
                  <th>CPU live</th>
                  <th>CPU capacity</th>
                  <th>Mem request</th>
                  <th>Mem live</th>
                  <th>Mem capacity</th>
                </tr>
              </thead>
              <tbody>
                {data.nodes.map(n => (
                  <tr key={n.name}>
                    <td><span className="p-mono" style={{ fontSize: 12 }}>{n.name}</span></td>
                    <td>
                      {n.schedulable
                        ? <span className="p-badge badge-success">schedulable</span>
                        : <span className="p-badge badge-warning">excluded</span>}
                    </td>
                    <td><span className="p-mono" style={{ fontSize: 12 }}>{n.cpu_requested_millis}m</span></td>
                    <td><span className="p-mono" style={{ fontSize: 12 }}>{data.metrics_available ? `${n.cpu_used_millis}m` : '—'}</span></td>
                    <td><span className="p-mono" style={{ fontSize: 12 }}>{n.cpu_allocatable_millis}m</span></td>
                    <td><span className="p-mono" style={{ fontSize: 12 }}>{fmtBytes(n.mem_requested_bytes)}</span></td>
                    <td><span className="p-mono" style={{ fontSize: 12 }}>{data.metrics_available ? fmtBytes(n.mem_used_bytes) : '—'}</span></td>
                    <td><span className="p-mono" style={{ fontSize: 12 }}>{fmtBytes(n.mem_allocatable_bytes)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.storage_available && (data.storage_nodes?.length ?? 0) > 0 && (
            <>
              <p className="p-section-title" style={{ margin: '24px 0 10px' }}>Nodes Storage</p>
              <div className="table-wrap">
                <table className="p-table" style={{ tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '22%' }}>Node</th>
                      <th style={{ width: '13%' }}>Status</th>
                      <th>Storage request</th>
                      <th>Storage free</th>
                      <th>Storage capacity</th>
                      <th>Disk size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.storage_nodes!.map(s => (
                      <tr key={s.name}>
                        <td><span className="p-mono" style={{ fontSize: 12 }}>{s.name}</span></td>
                        <td>
                          {s.schedulable
                            ? <span className="p-badge badge-success">schedulable</span>
                            : <span className="p-badge badge-warning">excluded</span>}
                        </td>
                        <td><span className="p-mono" style={{ fontSize: 12 }}>{fmtBytes(s.scheduled_bytes)}</span></td>
                        <td><span className="p-mono" style={{ fontSize: 12 }}>{fmtBytes(s.schedulable_bytes)}</span></td>
                        <td><span className="p-mono" style={{ fontSize: 12 }}>{fmtBytes(s.scheduled_bytes + s.schedulable_bytes)}</span></td>
                        <td><span className="p-mono" style={{ fontSize: 12 }}>{fmtBytes(s.maximum_bytes)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
