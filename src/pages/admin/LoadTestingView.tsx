import { useCallback, useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type LoadTestRun } from '@/lib/api'
import { imageTag } from '@/lib/utils'
import { isValidAdminDid } from '../portal/portalUtils'
import { LoadTestRunBadge } from './LoadTestRunBadge'

const activeRunStatuses = new Set(['creating', 'active', 'partial', 'deleting', 'delete_failed'])
const terminalSessionStatuses = new Set(['running', 'failed'])

function formatCreatedAt(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function LoadTestingView() {
  const navigate = useNavigate()
  const [runs, setRuns] = useState<LoadTestRun[]>([])
  const [images, setImages] = useState<Array<{ tag: string; image: string; latest?: boolean }>>([])
  const [count, setCount] = useState('5')
  const [adminDid, setAdminDid] = useState('')
  const [selectedImage, setSelectedImage] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const loadRuns = useCallback(() => (
    api.listLoadTests().then(setRuns).finally(() => setLoading(false))
  ), [])

  useEffect(() => {
    window.localStorage.removeItem('vtafarm.load-test.admin-did')
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
  const parsedCount = Number(count)
  const countIsValid = Number.isInteger(parsedCount) && parsedCount >= 1 && parsedCount <= 50

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!countIsValid) {
      setError('Number of VTAs must be between 1 and 50.')
      return
    }
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
      const created = await api.createLoadTest(parsedCount, did, selectedImage)
      setAdminDid('')
      await loadRuns()
      navigate(`/admin/load-testing/${created.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start load test')
    } finally {
      setCreating(false)
    }
  }

  function openRun(run: LoadTestRun) {
    navigate(`/admin/load-testing/${run.id}`)
  }

  function openRunWithKeyboard(event: KeyboardEvent<HTMLTableRowElement>, run: LoadTestRun) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openRun(run)
    }
  }

  return (
    <section className="p-content">
      <div className="page-head">
        <div>
          <h1>Load testing</h1>
          <p className="sub">Provision VTA-only sessions in parallel, verify readiness, then tear down the complete run.</p>
        </div>
      </div>

      <div className="p-card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <div>
            <h3 className="card-title">VTA provisioning test</h3>
            <p className="card-desc">Names are generated as <span className="p-mono">load-&lt;run&gt;-001</span>. The same admin DID is applied automatically to every session.</p>
          </div>
        </div>
        <form onSubmit={submit} className="load-test-form">
          <div className="load-test-form-grid">
            <div>
              <label className="p-label" htmlFor="lt-count">Number of VTAs</label>
              <input id="lt-count" className="p-input" type="number" min={1} max={50}
                value={count} onChange={e => setCount(e.target.value)} disabled={creating || hasActiveRun} />
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
          </div>
          {hasActiveRun && (
            <div className="p-alert alert-warning">
              <div className="grow"><p className="alert-title">Finish or delete the active run before starting another.</p></div>
            </div>
          )}
          {error && <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{error}</p>}
          <div>
            <button className="btn btn-default" type="submit"
              disabled={creating || hasActiveRun || !countIsValid || !selectedImage || !adminDid.trim()}>
              {creating ? 'Starting…' : countIsValid ? `Start ${parsedCount} VTA${parsedCount === 1 ? '' : 's'}` : 'Start VTAs'}
            </button>
          </div>
        </form>
      </div>

      <div className="p-row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <h2 className="card-title">Runs</h2>
        <span className="p-muted" style={{ fontSize: 12 }}>Select a run to see its VTAs</span>
      </div>
      {loading ? (
        <div className="p-card"><div className="p-muted" style={{ padding: 24 }}>Loading…</div></div>
      ) : runs.length === 0 ? (
        <div className="p-card"><div className="p-muted" style={{ padding: 24 }}>No provisioning load tests yet.</div></div>
      ) : (
        <div className="table-wrap">
          <table className="p-table load-test-runs-table">
            <thead>
              <tr><th>Run</th><th>Status</th><th>Created</th><th>Running</th><th>Failed</th><th>Image</th><th>Started</th><th className="col-actions"><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {runs.map(run => (
                <tr key={run.id} className="load-test-run-row" tabIndex={0} role="link"
                  onClick={() => openRun(run)} onKeyDown={event => openRunWithKeyboard(event, run)}>
                  <td><span className="p-mono">#{run.id}</span></td>
                  <td><LoadTestRunBadge status={run.status} /></td>
                  <td>{run.created_count}/{run.requested_count}</td>
                  <td>{run.running_count}</td>
                  <td>{run.failed_count}</td>
                  <td><span className="p-mono" style={{ fontSize: 12 }}>{imageTag(run.vta_image)}</span></td>
                  <td title={formatCreatedAt(run.created_at)}>{formatCreatedAt(run.created_at)}</td>
                  <td className="col-actions"><button type="button" className="btn btn-outline btn-sm">View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
