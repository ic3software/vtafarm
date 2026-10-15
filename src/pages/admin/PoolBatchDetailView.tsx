import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { api, type PoolBatch, type PoolClaim, type PoolSession } from '@/lib/api'
import { imageTag } from '@/lib/utils'
import { statusBadge } from '../portal/portalUtils'

const activeClaimStatuses = new Set(['open', 'claimed', 'confirmed', 'provisioning'])

function formatCreatedAt(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function claimStorageKey(batchID: number) {
  return `vtafarm:pool-claim:${batchID}`
}

function ClaimStation({ batch, onBatchChange }: { batch: PoolBatch; onBatchChange: () => Promise<void> }) {
  const storageKey = claimStorageKey(batch.id)
  const [claim, setClaim] = useState<PoolClaim | null>(null)
  const [loading, setLoading] = useState(false)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState('')

  const loadClaim = useCallback(async (requestID: string) => {
    try {
      const next = await api.getPoolClaim(requestID)
      if (next.batch_id !== batch.id) throw new Error('Saved claim belongs to another batch.')
      setClaim(next)
      setError('')
    } catch (err) {
      sessionStorage.removeItem(storageKey)
      setClaim(null)
      setError(err instanceof Error ? err.message : 'Unable to resume this claim')
    }
  }, [batch.id, storageKey])

  useEffect(() => {
    const requestID = sessionStorage.getItem(storageKey)
    if (!requestID) return
    const timer = window.setTimeout(() => { void loadClaim(requestID) }, 0)
    return () => window.clearTimeout(timer)
  }, [loadClaim, storageKey])

  useEffect(() => {
    const requestID = claim?.connection.request_id
    if (!requestID || !activeClaimStatuses.has(claim.connection.status)) return
    const timer = window.setInterval(() => { void loadClaim(requestID) }, 1500)
    return () => window.clearInterval(timer)
  }, [claim?.connection.request_id, claim?.connection.status, loadClaim])

  async function nextParticipant() {
    setLoading(true)
    setError('')
    try {
      const next = await api.reservePoolClaim(batch.id)
      sessionStorage.setItem(storageKey, next.connection.request_id)
      setClaim(next)
      await onBatchChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reserve a VTA')
    } finally {
      setLoading(false)
    }
  }

  async function confirm() {
    if (!claim) return
    setActing(true)
    setError('')
    try {
      setClaim(await api.confirmPoolClaim(claim.connection.request_id))
      await onBatchChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to confirm this claim')
    } finally {
      setActing(false)
    }
  }

  async function reject() {
    if (!claim) return
    setActing(true)
    setError('')
    try {
      setClaim(await api.rejectPoolClaim(claim.connection.request_id))
      await onBatchChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reject this claim')
    } finally {
      setActing(false)
    }
  }

  function clearClaim() {
    sessionStorage.removeItem(storageKey)
    setClaim(null)
    setError('')
  }

  const connection = claim?.connection
  return (
    <div className="p-card pool-station">
      <div className="card-header with-action">
        <div>
          <h3 className="card-title">Claim station</h3>
          <p className="card-desc">One QR reserves one waiting VTA. Compare the code before confirming.</p>
        </div>
        {claim && <span className="p-badge badge-secondary p-mono">{claim.vta_name}</span>}
      </div>
      <div className="pool-station-body">
        {!connection ? (
          <div className="pool-station-empty">
            <div className="pool-station-icon">⌁</div>
            <h3>{batch.counts.waiting > 0 ? 'Ready for the next participant' : 'No waiting VTA yet'}</h3>
            <p>{batch.counts.waiting > 0
              ? `${batch.counts.waiting} prepared VTA${batch.counts.waiting === 1 ? '' : 's'} remain in this batch.`
              : batch.counts.creating > 0 ? 'Preparation is still running. This page updates automatically.' : 'Retry failed items or create another batch.'}</p>
            <button className="btn btn-default" onClick={nextParticipant} disabled={loading || batch.counts.waiting < 1}>
              {loading ? 'Reserving…' : 'Show claim QR'}
            </button>
          </div>
        ) : connection.status === 'open' ? (
          <div className="pool-claim-grid">
            <div className="pool-qr-wrap">
              {connection.trigger_link
                ? <QRCodeSVG value={connection.trigger_link} size={292} level="M" marginSize={4} title="Keyring VTA claim QR code" />
                : <div className="pool-qr-missing">QR unavailable</div>}
            </div>
            <div className="pool-claim-copy">
              <span className="pool-step">Step 1</span>
              <h2>Scan with Keyring</h2>
              <p>Ask the participant to scan this QR. This QR belongs only to <span className="p-mono">{claim.vta_name}</span>.</p>
              <p className="p-muted">Expires {new Date(connection.expires_at).toLocaleTimeString()}</p>
              <button className="btn btn-ghost btn-sm" onClick={reject} disabled={acting}>Cancel this QR</button>
            </div>
          </div>
        ) : connection.status === 'claimed' ? (
          <div className="pool-confirm-panel">
            <span className="pool-step">Step 2</span>
            <h2>Compare the participant's code</h2>
            <div className="pool-claim-check" aria-label={`Claim check ${connection.claim_check}`}>{connection.claim_check}</div>
            <p>Confirm only when Keyring shows exactly the same code.</p>
            <div className="p-row gap-8 pool-confirm-actions">
              <button className="btn btn-default" onClick={confirm} disabled={acting}>{acting ? 'Confirming…' : 'Codes match — activate VTA'}</button>
              <button className="btn btn-outline" onClick={reject} disabled={acting}>Reject</button>
            </div>
          </div>
        ) : connection.status === 'confirmed' || connection.status === 'provisioning' ? (
          <div className="pool-progress-panel">
            <span className="pool-spinner" />
            <h2>Activating {claim.vta_name}</h2>
            <p>The participant owns this VTA now. Farm is importing their DID and starting the parked Deployment.</p>
            {connection.error && <p className="pool-form-error">{connection.error}</p>}
          </div>
        ) : connection.status === 'released' ? (
          <div className="pool-success-panel">
            <div className="pool-success-icon">✓</div>
            <h2>{claim.vta_name} is running</h2>
            <p>Keyring can now use this VTA. Move on to the next participant.</p>
            <button className="btn btn-default" onClick={() => { clearClaim(); void nextParticipant() }} disabled={loading || batch.counts.waiting < 1}>
              {batch.counts.waiting > 0 ? 'Next participant' : 'No waiting VTA remains'}
            </button>
          </div>
        ) : (
          <div className="pool-station-empty">
            <h3>This claim was {connection.status}</h3>
            <p>No VTA was handed over. Generate a new QR when the next participant is ready.</p>
            <button className="btn btn-default" onClick={() => { clearClaim(); void nextParticipant() }} disabled={loading || batch.counts.waiting < 1}>Generate another QR</button>
          </div>
        )}
        {error && <p className="pool-form-error pool-station-error">{error}</p>}
      </div>
    </div>
  )
}

function SessionRow({ session, selected, onSelect, onRetry }: {
  session: PoolSession
  selected: boolean
  onSelect: (checked: boolean) => void
  onRetry: () => void
}) {
  return (
    <tr>
      <td>
        <input type="checkbox" checked={selected} disabled={!session.cleanable}
          onChange={event => onSelect(event.target.checked)} aria-label={`Select ${session.vta_name} for cleanup`} />
      </td>
      <td><span className="p-mono">{session.vta_name}</span><div className="p-muted">Session #{session.session_id} · User #{session.user_id}</div></td>
      <td>{statusBadge(session.status)}</td>
      <td>{session.claimed ? <span className="p-badge badge-success">claimed</span>
        : session.claim_state ? <span className="p-badge badge-warning">{session.claim_state}</span>
          : <span className="p-muted">unclaimed</span>}</td>
      <td className="pool-session-error" title={session.error_msg}>{session.error_msg || '—'}</td>
      <td>
        {session.status === 'failed' && !session.claimed && (
          <button type="button" className="btn btn-outline btn-sm" onClick={onRetry}>Retry</button>
        )}
      </td>
    </tr>
  )
}

export function PoolBatchDetailView() {
  const navigate = useNavigate()
  const { id } = useParams()
  const batchID = Number(id)
  const validID = Number.isInteger(batchID) && batchID > 0
  const [batch, setBatch] = useState<PoolBatch | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [cleaning, setCleaning] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!validID) return
    try {
      const next = await api.getPoolBatch(batchID)
      setBatch(next)
      setSelected(current => new Set([...current].filter(sessionID => next.sessions?.some(item => item.session_id === sessionID && item.cleanable))))
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pool batch')
    } finally {
      setLoading(false)
    }
  }, [batchID, validID])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])
  useEffect(() => {
    if (!batch) return
    const timer = window.setInterval(() => { void load() }, 3000)
    return () => window.clearInterval(timer)
  }, [batch, load])

  const cleanable = useMemo(() => batch?.sessions?.filter(session => session.cleanable) ?? [], [batch])
  const allSelected = cleanable.length > 0 && cleanable.every(session => selected.has(session.session_id))

  async function cleanup() {
    const ids = [...selected]
    if (ids.length === 0 || !window.confirm(`Delete ${ids.length} unused pooled VTA${ids.length === 1 ? '' : 's'} and their dedicated user accounts?`)) return
    setCleaning(true)
    setError('')
    try {
      await api.cleanupPoolSessions(ids)
      setSelected(new Set())
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start cleanup')
    } finally {
      setCleaning(false)
    }
  }

  async function retry(sessionID: number) {
    setError('')
    try {
      await api.retryPoolSession(sessionID)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry this VTA')
    }
  }

  if (!validID) return <section className="p-content"><div className="p-alert alert-destructive"><div className="grow"><p className="alert-title">Invalid pool batch ID.</p></div></div></section>

  return (
    <section className="p-content">
      <div className="page-head">
        <div>
          <button type="button" className="load-test-back" onClick={() => navigate('/admin/pools')}>← VTA pools</button>
          <h1>{batch?.label ?? 'VTA pool'}</h1>
          <p className="sub">{batch ? `Batch #${batch.id} · ${imageTag(batch.vta_image ?? '')} · created ${formatCreatedAt(batch.created_at)}` : 'Loading batch…'}</p>
        </div>
      </div>

      {error && <div className="p-alert alert-destructive pool-page-error"><div className="grow"><p className="alert-title">Pool operation failed</p><p className="alert-desc">{error}</p></div></div>}
      {loading && !batch ? <div className="p-card"><div className="p-muted pool-empty-row">Loading…</div></div> : batch && (
        <>
          <div className="pool-stats">
            <div className="p-stat"><div className="k">Total</div><div className="v">{batch.counts.total}<small> / {batch.requested_count}</small></div></div>
            <div className="p-stat"><div className="k">Preparing</div><div className="v">{batch.counts.creating}</div></div>
            <div className="p-stat"><div className="k">Waiting</div><div className="v">{batch.counts.waiting}</div></div>
            <div className="p-stat"><div className="k">Claimed</div><div className="v">{batch.counts.running + batch.counts.activating}</div></div>
            <div className="p-stat"><div className="k">Failed</div><div className="v">{batch.counts.failed}</div></div>
          </div>

          <ClaimStation batch={batch} onBatchChange={load} />

          <div className="p-card pool-members-card">
            <div className="card-header with-action">
              <div><h3 className="card-title">Pool members</h3><p className="card-desc">Claimed VTAs are protected. Cleanup permanently removes only selected unused inventory.</p></div>
              <div className="p-row gap-8">
                <button className="btn btn-outline btn-sm" type="button"
                  onClick={() => setSelected(allSelected ? new Set() : new Set(cleanable.map(session => session.session_id)))}
                  disabled={cleanable.length === 0}>{allSelected ? 'Clear selection' : 'Select all unused'}</button>
                <button className="btn btn-destructive btn-sm" type="button" onClick={cleanup}
                  disabled={selected.size === 0 || cleaning}>{cleaning ? 'Starting cleanup…' : `Clean up selected (${selected.size})`}</button>
              </div>
            </div>
            <div className="table-wrap pool-members-table-wrap">
              <table className="p-table pool-members-table">
                <thead><tr><th><span className="sr-only">Select</span></th><th>VTA</th><th>Provisioning</th><th>Claim</th><th>Error</th><th /></tr></thead>
                <tbody>
                  {(batch.sessions ?? []).map(session => (
                    <SessionRow key={session.session_id} session={session} selected={selected.has(session.session_id)}
                      onSelect={checked => setSelected(current => {
                        const next = new Set(current)
                        if (checked) next.add(session.session_id); else next.delete(session.session_id)
                        return next
                      })}
                      onRetry={() => { void retry(session.session_id) }} />
                  ))}
                  {batch.sessions?.length === 0 && <tr><td colSpan={6} className="p-muted pool-empty-row">This batch has no remaining members.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
