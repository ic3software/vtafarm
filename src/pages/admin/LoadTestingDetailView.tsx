import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, type LoadTestCheck, type LoadTestRun } from '@/lib/api'
import { imageTag } from '@/lib/utils'
import { statusBadge } from '../portal/portalUtils'
import { LoadTestRunBadge } from './LoadTestRunBadge'

const terminalSessionStatuses = new Set(['running', 'failed'])

export function LoadTestingDetailView() {
  const navigate = useNavigate()
  const { id } = useParams()
  const runID = Number(id)
  const [run, setRun] = useState<LoadTestRun | null>(null)
  const [check, setCheck] = useState<LoadTestCheck | null>(null)
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const validRunID = Number.isInteger(runID) && runID > 0
  const loadRun = useCallback(() => {
    if (!validRunID) return Promise.resolve()
    return api.getLoadTest(runID).then(next => {
      if (next.status === 'deleted') {
        navigate('/admin/load-testing', { replace: true })
        return
      }
      setRun(next)
      setError('')
    }).catch(err => {
      setError(err instanceof Error ? err.message : 'Failed to load test run')
    }).finally(() => setLoading(false))
  }, [navigate, runID, validRunID])

  useEffect(() => { void loadRun() }, [loadRun])

  const needsPolling = useMemo(() => !!run && (
    run.status === 'creating' || run.status === 'deleting' ||
    run.sessions.some(session => !terminalSessionStatuses.has(session.status))
  ), [run])

  useEffect(() => {
    if (!needsPolling) return
    const timer = window.setInterval(() => { void loadRun() }, 3000)
    return () => window.clearInterval(timer)
  }, [loadRun, needsPolling])

  async function checkOnline() {
    if (!run) return
    setChecking(true)
    setError('')
    try {
      setCheck(await api.checkLoadTest(run.id))
      await loadRun()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Online check failed')
    } finally {
      setChecking(false)
    }
  }

  async function deleteRun() {
    if (!run || !window.confirm(`Delete all ${run.sessions.length} VTA sessions in load test #${run.id}?`)) return
    setDeleting(true)
    setError('')
    try {
      await api.deleteLoadTest(run.id)
      setCheck(null)
      await loadRun()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete load test')
    } finally {
      setDeleting(false)
    }
  }

  const checkedByName = new Map(check?.sessions.map(item => [item.vta_name, item]))
  const canDelete = !!run && run.status !== 'creating' && run.status !== 'deleting'

  if (!validRunID) return (
    <section className="p-content">
      <div className="p-alert alert-destructive"><div className="grow"><p className="alert-title">Unable to load this run</p><p className="alert-desc">Invalid load-test run ID.</p></div></div>
    </section>
  )

  return (
    <section className="p-content">
      <div className="page-head">
        <div>
          <button type="button" className="load-test-back" onClick={() => navigate('/admin/load-testing')}>← Load testing</button>
          <h1>{run ? `Run #${run.id}` : 'Load-test run'}</h1>
          <p className="sub">Inspect each VTA and check its live Kubernetes readiness.</p>
        </div>
      </div>

      {loading ? (
        <div className="p-card"><div className="p-muted" style={{ padding: 24 }}>Loading…</div></div>
      ) : !run ? (
        <div className="p-alert alert-destructive"><div className="grow"><p className="alert-title">Unable to load this run</p><p className="alert-desc">{error}</p></div></div>
      ) : (
        <div className="p-card">
          <div className="card-header with-action load-test-run-header">
            <div>
              <div className="p-row gap-8" style={{ alignItems: 'center' }}>
                <h3 className="card-title">Run #{run.id}</h3>
                <LoadTestRunBadge status={run.status} />
              </div>
              <p className="card-desc">
                {run.created_count}/{run.requested_count} created · {run.running_count} running · {run.failed_count} failed · image {imageTag(run.vta_image)}
              </p>
            </div>
            <div className="p-row gap-8 load-test-run-actions">
              <button className="btn btn-outline btn-sm" onClick={checkOnline}
                disabled={checking || run.sessions.length === 0 || run.status === 'deleting'}>
                {checking ? 'Checking…' : 'Check online'}
              </button>
              <button className="btn btn-destructive btn-sm" onClick={deleteRun}
                disabled={!canDelete || deleting}>
                {run.status === 'delete_failed' ? 'Retry delete' : deleting || run.status === 'deleting' ? 'Deleting…' : 'Delete all'}
              </button>
            </div>
          </div>

          {check && (
            <div className={`p-alert ${check.all_online ? 'alert-success' : 'alert-warning'}`} style={{ margin: '0 24px 20px' }}>
              <div className="grow">
                <p className="alert-title">{check.online_count}/{check.total} online{check.all_online ? ' — all readiness probes passed' : ''}</p>
                <p className="alert-desc">Checked {new Date(check.checked_at).toLocaleTimeString()}</p>
              </div>
            </div>
          )}
          {(error || run.error_msg) && (
            <p style={{ margin: '0 24px 20px', fontSize: 13, color: 'hsl(var(--destructive))' }}>{error || run.error_msg}</p>
          )}

          {run.sessions.length === 0 ? (
            <div className="p-muted" style={{ padding: '0 24px 24px' }}>No VTA sessions have been created yet.</div>
          ) : (
            <div className="table-wrap" style={{ border: 0, borderTop: '1px solid hsl(var(--border))', borderRadius: 0 }}>
              <table className="p-table load-test-table">
                <thead><tr><th>VTA</th><th>Session ID</th><th>Provisioning</th><th>Readiness</th><th>Endpoint</th><th>Error</th></tr></thead>
                <tbody>
                  {run.sessions.map(session => {
                    const result = checkedByName.get(session.vta_name)
                    return (
                      <tr key={session.id}>
                        <td><span className="p-mono" style={{ fontSize: 12 }}>{session.vta_name}</span></td>
                        <td><span className="p-mono" style={{ fontSize: 12 }}>#{session.id}</span></td>
                        <td title={session.error_msg}>{statusBadge(session.status)}</td>
                        <td title={result?.reason}>
                          {!result ? <span className="p-muted">not checked</span>
                            : result.online ? <span className="p-badge badge-success">online</span>
                              : <span className="p-badge badge-destructive">offline</span>}
                        </td>
                        <td><a className="p-mono" style={{ fontSize: 12 }} href={`https://${session.fqdn}/health`} target="_blank" rel="noreferrer">{session.fqdn}</a></td>
                        <td className="load-test-error" title={session.error_msg}>{session.error_msg || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
