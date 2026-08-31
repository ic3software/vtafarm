import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, type LoadTestCheck, type LoadTestRun } from '@/lib/api'
import { isValidAdminDid, statusBadge } from '../portal/portalUtils'

const activeRunStatuses = new Set(['creating', 'active', 'partial', 'deleting', 'delete_failed'])
const terminalSessionStatuses = new Set(['running', 'failed'])
const adminDidStorageKey = 'vtafarm.load-test.admin-did'

function runBadge(status: LoadTestRun['status']) {
  const cls = status === 'deleted' ? 'badge-secondary'
    : status === 'failed' || status === 'partial' || status === 'delete_failed' ? 'badge-destructive'
      : status === 'active' ? 'badge-success' : 'badge-warning'
  return <span className={`p-badge ${cls}`}>{status.replace('_', ' ')}</span>
}

function imageTag(image: string) {
  return image.split(':').at(-1) ?? image
}

export function LoadTestingView() {
  const [runs, setRuns] = useState<LoadTestRun[]>([])
  const [images, setImages] = useState<Array<{ tag: string; image: string; latest?: boolean }>>([])
  const [count, setCount] = useState(5)
  const [adminDid, setAdminDid] = useState(() => window.localStorage.getItem(adminDidStorageKey) ?? '')
  const [selectedImage, setSelectedImage] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [checking, setChecking] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [checks, setChecks] = useState<Record<number, LoadTestCheck>>({})
  const [error, setError] = useState('')

  const loadRuns = useCallback(() => (
    api.listLoadTests().then(setRuns).finally(() => setLoading(false))
  ), [])

  useEffect(() => {
    void loadRuns().catch(() => {})
    void api.adminListImages('vta').then(options => {
      setImages(options)
      const preferred = options.find(option => option.latest) ?? options[0]
      if (preferred) setSelectedImage(preferred.image)
    }).catch(() => {})
  }, [loadRuns])

  const needsPolling = useMemo(() => runs.some(run =>
    run.status === 'creating' || run.status === 'deleting' ||
    run.sessions.some(session => !terminalSessionStatuses.has(session.status)),
  ), [runs])

  useEffect(() => {
    if (!needsPolling) return
    const timer = window.setInterval(() => { void loadRuns().catch(() => {}) }, 3000)
    return () => window.clearInterval(timer)
  }, [loadRuns, needsPolling])

  const hasActiveRun = runs.some(run => activeRunStatuses.has(run.status))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const did = adminDid.trim()
    if (!isValidAdminDid(did)) {
      setError('Enter the did:key value produced by pnm setup.')
      return
    }
    if (!selectedImage) {
      setError('Select a VTA image.')
      return
    }
    setCreating(true)
    setError('')
    try {
      await api.createLoadTest(count, did, selectedImage)
      window.localStorage.setItem(adminDidStorageKey, did)
      await loadRuns()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start load test')
    } finally {
      setCreating(false)
    }
  }

  async function checkOnline(run: LoadTestRun) {
    setChecking(run.id)
    setError('')
    try {
      const result = await api.checkLoadTest(run.id)
      setChecks(previous => ({ ...previous, [run.id]: result }))
      await loadRuns()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Online check failed')
    } finally {
      setChecking(null)
    }
  }

  async function deleteRun(run: LoadTestRun) {
    if (!window.confirm(`Delete all ${run.sessions.length} VTA sessions in load test #${run.id}?`)) return
    setDeleting(run.id)
    setError('')
    try {
      await api.deleteLoadTest(run.id)
      setChecks(previous => {
        const next = { ...previous }
        delete next[run.id]
        return next
      })
      await loadRuns()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete load test')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <section className="p-content">
      <div className="page-head">
        <div>
          <h1>Load testing</h1>
          <p className="sub">Provision isolated VTA-only sessions in parallel, verify readiness, then tear down the complete run.</p>
        </div>
      </div>

      <div className="p-card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div>
            <h3 className="card-title">VTA provisioning test</h3>
            <p className="card-desc">Names are generated as <span className="p-mono">load-&lt;run&gt;-001</span>. The same admin DID is applied automatically to every session.</p>
          </div>
        </div>
        <form onSubmit={submit} style={{ display: 'grid', gap: 16, padding: 16 }}>
          <div className="load-test-form-grid">
            <div>
              <label className="p-label" htmlFor="lt-count">Number of VTAs</label>
              <input id="lt-count" className="p-input" type="number" min={1} max={50}
                value={count} onChange={e => setCount(Number(e.target.value))} disabled={creating || hasActiveRun} />
            </div>
            <div>
              <label className="p-label" htmlFor="lt-image">VTA image</label>
              <select id="lt-image" className="p-select p-mono" value={selectedImage}
                onChange={e => setSelectedImage(e.target.value)} disabled={creating || hasActiveRun || images.length === 0}>
                {images.length === 0 && <option value="">Loading images…</option>}
                {images.map(option => (
                  <option key={option.image} value={option.image}>{option.tag}{option.latest ? ' (latest)' : ''}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="p-label" htmlFor="lt-admin-did">Admin DID</label>
            <input id="lt-admin-did" className="p-input p-mono" type="text" placeholder="did:key:z6Mk…"
              value={adminDid} onChange={e => setAdminDid(e.target.value)} disabled={creating || hasActiveRun} />
            <p className="p-muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
              Enter it once; the backend supplies it to every provisioning pipeline in this run.
            </p>
          </div>
          {hasActiveRun && (
            <div className="p-alert alert-warning">
              <div className="grow"><p className="alert-title">Finish or delete the active run before starting another.</p></div>
            </div>
          )}
          {error && <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{error}</p>}
          <div>
            <button className="btn btn-default" type="submit"
              disabled={creating || hasActiveRun || count < 1 || count > 50 || !selectedImage || !adminDid.trim()}>
              {creating ? 'Starting…' : `Start ${count} VTA${count === 1 ? '' : 's'}`}
            </button>
          </div>
        </form>
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        {loading ? (
          <div className="p-card"><div className="p-muted" style={{ padding: 16 }}>Loading…</div></div>
        ) : runs.length === 0 ? (
          <div className="p-card"><div className="p-muted" style={{ padding: 16 }}>No provisioning load tests yet.</div></div>
        ) : runs.map(run => {
          const check = checks[run.id]
          const checkedByName = new Map(check?.sessions.map(item => [item.vta_name, item]))
          const canDelete = run.status !== 'creating' && run.status !== 'deleting' && run.status !== 'deleted'
          return (
            <div className="p-card" key={run.id}>
              <div className="card-header" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div className="p-row gap-8" style={{ alignItems: 'center' }}>
                    <h3 className="card-title">Run #{run.id}</h3>
                    {runBadge(run.status)}
                  </div>
                  <p className="card-desc">
                    {run.created_count}/{run.requested_count} created · {run.running_count} running · {run.failed_count} failed · image {imageTag(run.vta_image)}
                  </p>
                </div>
                <div className="p-row gap-8">
                  <button className="btn btn-outline btn-sm" onClick={() => checkOnline(run)}
                    disabled={checking === run.id || run.sessions.length === 0 || run.status === 'deleting' || run.status === 'deleted'}>
                    {checking === run.id ? 'Checking…' : 'Check online'}
                  </button>
                  <button className="btn btn-destructive btn-sm" onClick={() => deleteRun(run)}
                    disabled={!canDelete || deleting === run.id}>
                    {run.status === 'delete_failed' ? 'Retry delete' : deleting === run.id || run.status === 'deleting' ? 'Deleting…' : 'Delete all'}
                  </button>
                </div>
              </div>

              {check && (
                <div className={`p-alert ${check.all_online ? 'alert-success' : 'alert-warning'}`} style={{ margin: '0 16px 16px' }}>
                  <div className="grow">
                    <p className="alert-title">{check.online_count}/{check.total} online{check.all_online ? ' — all readiness probes passed' : ''}</p>
                    <p className="alert-desc">Checked {new Date(check.checked_at).toLocaleTimeString()}</p>
                  </div>
                </div>
              )}
              {run.error_msg && (
                <p style={{ margin: '0 16px 16px', fontSize: 13, color: 'hsl(var(--destructive))' }}>{run.error_msg}</p>
              )}

              {run.sessions.length > 0 && (
                <div className="table-wrap" style={{ border: 0, borderTop: '1px solid hsl(var(--border))', borderRadius: 0 }}>
                  <table className="p-table">
                    <thead><tr><th>VTA</th><th>Provisioning</th><th>Readiness</th><th>Endpoint</th></tr></thead>
                    <tbody>
                      {run.sessions.map(session => {
                        const result = checkedByName.get(session.vta_name)
                        return (
                          <tr key={session.id}>
                            <td><span className="p-mono" style={{ fontSize: 12 }}>{session.vta_name}</span></td>
                            <td title={session.error_msg}>{statusBadge(session.status)}</td>
                            <td title={result?.reason}>
                              {!result ? <span className="p-muted">not checked</span>
                                : result.online ? <span className="p-badge badge-success">online</span>
                                  : <span className="p-badge badge-destructive">offline</span>}
                            </td>
                            <td><a className="p-mono" style={{ fontSize: 12 }} href={`https://${session.fqdn}/health`} target="_blank" rel="noreferrer">{session.fqdn}</a></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
