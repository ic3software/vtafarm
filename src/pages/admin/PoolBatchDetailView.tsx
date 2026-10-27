import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { api, type PoolBatch, type PoolClaim, type PoolSession } from '@/lib/api'
import { imageTag } from '@/lib/utils'
import { statusBadge } from '../portal/portalUtils'

const activeClaimStatuses = new Set(['open', 'claimed', 'confirmed', 'provisioning'])

function formatCreatedAt(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function claimStorageKey(batchID: number) {
  return `vtafarm:pool-claim:${batchID}`
}

function claimIDFromTriggerLink(link: string) {
  try {
    return new URLSearchParams(new URL(link).hash.slice(1)).get('_id') ?? ''
  } catch {
    return ''
  }
}

function ClaimStation({ batch, onBatchChange }: { batch: PoolBatch; onBatchChange: () => Promise<void> }) {
  const storageKey = claimStorageKey(batch.id)
  const [claim, setClaim] = useState<PoolClaim | null>(null)
  const [loading, setLoading] = useState(false)
  const [acting, setActing] = useState<'confirm' | 'reject' | null>(null)
  const [error, setError] = useState('')
  const [clockMs, setClockMs] = useState(() => Date.now())
  const [serverOffsetMs, setServerOffsetMs] = useState(0)
  const [copiedClaimID, setCopiedClaimID] = useState<string | null>(null)

  const applyClaim = useCallback((next: PoolClaim) => {
    const clientNow = Date.now()
    const serverNow = Date.parse(next.server_time)
    setClockMs(clientNow)
    setServerOffsetMs(Number.isFinite(serverNow) ? serverNow - clientNow : 0)
    setClaim(next)
  }, [])

  const loadClaim = useCallback(async (requestID: string) => {
    try {
      const next = await api.getPoolClaim(requestID)
      if (sessionStorage.getItem(storageKey) !== requestID) return
      if (next.batch_id !== batch.id) throw new Error('Saved claim belongs to another batch.')
      applyClaim(next)
    } catch (err) {
      if (sessionStorage.getItem(storageKey) !== requestID) return
      sessionStorage.removeItem(storageKey)
      setClaim(null)
      setError(err instanceof Error ? err.message : 'Unable to resume this claim')
    }
  }, [applyClaim, batch.id, storageKey])

  useEffect(() => {
    const requestID = sessionStorage.getItem(storageKey)
    if (!requestID) return
    const timer = window.setTimeout(() => { void loadClaim(requestID) }, 0)
    return () => window.clearTimeout(timer)
  }, [loadClaim, storageKey])

  useEffect(() => {
    const requestID = claim?.connection.request_id
    if (!requestID || !activeClaimStatuses.has(claim.connection.status)) return
    let stopped = false
    let timer: number | undefined
    const poll = async () => {
      await loadClaim(requestID)
      if (!stopped) timer = window.setTimeout(() => { void poll() }, 1500)
    }
    timer = window.setTimeout(() => { void poll() }, 1500)
    return () => {
      stopped = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [claim?.connection.request_id, claim?.connection.status, loadClaim])

  useEffect(() => {
    if (claim?.connection.status !== 'open') return
    const timer = window.setInterval(() => setClockMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [claim?.connection.request_id, claim?.connection.status])

  async function nextParticipant() {
    setLoading(true)
    setError('')
    try {
      const next = await api.reservePoolClaim(batch.id)
      sessionStorage.setItem(storageKey, next.connection.request_id)
      applyClaim(next)
      await onBatchChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reserve a VTA')
    } finally {
      setLoading(false)
    }
  }

  async function confirm() {
    if (!claim) return
    setActing('confirm')
    setError('')
    try {
      applyClaim(await api.confirmPoolClaim(claim.connection.request_id))
      await onBatchChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to confirm this claim')
    } finally {
      setActing(null)
    }
  }

  async function reject() {
    if (!claim) return
    setActing('reject')
    setError('')
    try {
      applyClaim(await api.rejectPoolClaim(claim.connection.request_id))
      await onBatchChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reject this claim')
    } finally {
      setActing(null)
    }
  }

  function clearClaim() {
    sessionStorage.removeItem(storageKey)
    setClaim(null)
    setError('')
  }

  const connection = claim?.connection
  const developmentClaimID = import.meta.env.DEV && connection?.trigger_link
    ? claimIDFromTriggerLink(connection.trigger_link)
    : ''
  const remainingSeconds = connection?.status === 'open'
    ? Math.max(0, Math.ceil((Date.parse(connection.expires_at) - (clockMs + serverOffsetMs)) / 1000))
    : null

  async function copyDevelopmentClaimID() {
    if (!developmentClaimID) return
    try {
      await navigator.clipboard.writeText(developmentClaimID)
      setCopiedClaimID(developmentClaimID)
      window.setTimeout(() => setCopiedClaimID(current => current === developmentClaimID ? null : current), 2000)
    } catch {
      setError('Unable to copy the claim ID')
    }
  }

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
              <p className="pool-claim-countdown" role="timer">{remainingSeconds === 0 ? 'QR Code expired' : `QR Code expires in ${formatCountdown(remainingSeconds ?? 0)}`}</p>
              {developmentClaimID && (
                <div className="qr-development-payload pool-claim-development-url">
                  <span>Claim ID (development only)</span>
                  <div className="pool-claim-development-value">
                    <code>{developmentClaimID}</code>
                    <button className="btn btn-outline btn-sm" type="button" onClick={copyDevelopmentClaimID}>
                      {copiedClaimID === developmentClaimID ? 'Copied' : 'Copy ID'}
                    </button>
                  </div>
                </div>
              )}
              <button className="btn btn-outline btn-sm" onClick={reject} disabled={acting !== null}>
                {acting === 'reject' ? 'Cancelling…' : 'Cancel this QR'}
              </button>
            </div>
          </div>
        ) : connection.status === 'claimed' ? (
          <div className="pool-confirm-panel">
            <span className="pool-step">Step 2</span>
            <h2>Compare this code with Keyring</h2>
            <div className="pool-claim-check" aria-label={`Claim check ${connection.claim_check}`}>{connection.claim_check}</div>
            <div className="p-row gap-8 pool-confirm-actions">
              <button className="btn btn-default" onClick={confirm} disabled={acting !== null}>{acting === 'confirm' ? 'Confirming…' : 'Codes match — activate VTA'}</button>
              <button className="btn btn-outline" onClick={reject} disabled={acting !== null}>{acting === 'reject' ? 'Rejecting…' : 'Reject'}</button>
            </div>
          </div>
        ) : connection.status === 'confirmed' || connection.status === 'provisioning' ? (
          <div className="pool-progress-panel">
            <h2>{claim.vta_name} is provisioning in the background</h2>
            <p>The next participant can claim another VTA now.</p>
            {connection.error && <p className="pool-form-error">{connection.error}</p>}
            <button className="btn btn-default" onClick={() => { clearClaim(); void nextParticipant() }} disabled={loading || batch.counts.waiting < 1}>
              {loading ? 'Reserving…' : batch.counts.waiting > 0 ? 'Next participant' : 'No waiting VTA remains'}
            </button>
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
        {error && <p className="pool-form-error pool-station-error" role="alert">{error}</p>}
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

function SelectAllCheckbox({ checked, indeterminate, disabled, onChange }: {
  checked: boolean
  indeterminate: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <input ref={ref} type="checkbox" checked={checked} disabled={disabled}
      onChange={event => onChange(event.target.checked)} aria-label="Select all unused VTAs" />
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
  const [cleaningPool, setCleaningPool] = useState(false)
  const [addingInventory, setAddingInventory] = useState(false)
  const [showAddInventory, setShowAddInventory] = useState(false)
  const [additionCount, setAdditionCount] = useState('')
  const [changingPublicSignup, setChangingPublicSignup] = useState(false)
  const [showSelectedCleanupConfirm, setShowSelectedCleanupConfirm] = useState(false)
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false)
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
    let stopped = false
    let timer: number | undefined
    const poll = async () => {
      await load()
      if (!stopped) timer = window.setTimeout(() => { void poll() }, 3000)
    }
    timer = window.setTimeout(() => { void poll() }, 3000)
    return () => {
      stopped = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [batch, load])

  const cleanable = useMemo(() => batch?.sessions?.filter(session => session.cleanable) ?? [], [batch])
  const allSelected = cleanable.length > 0 && cleanable.every(session => selected.has(session.session_id))
  const someSelected = cleanable.some(session => selected.has(session.session_id))
  const canCleanPool = batch !== null && batch.counts.creating === 0 && batch.counts.deleting === 0 &&
    (batch.sessions ?? []).every(session => session.cleanable)
  const cleanPoolTitle = !batch ? ''
    : batch.counts.deleting > 0 ? 'Pool cleanup is already running.'
      : batch.counts.creating > 0 ? 'Wait until every VTA finishes preparation before cleaning up this pool.'
        : batch.counts.claiming > 0 ? 'Cancel or reject the active claim before cleaning up this pool.'
          : batch.counts.running + batch.counts.activating > 0 ? 'Claimed VTAs prevent whole-pool cleanup.'
            : canCleanPool ? 'Permanently remove this unused pool.' : 'Every remaining VTA must be unused and cleanable.'

  async function cleanup() {
    const ids = [...selected]
    if (ids.length === 0) return
    setCleaning(true)
    setError('')
    try {
      await api.cleanupPoolSessions(ids)
      setShowSelectedCleanupConfirm(false)
      setSelected(new Set())
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start cleanup')
    } finally {
      setCleaning(false)
    }
  }

  async function cleanupPool() {
    if (!batch || !canCleanPool) return
    setCleaningPool(true)
    setError('')
    try {
      await api.cleanupPoolBatch(batch.id)
      sessionStorage.removeItem(claimStorageKey(batch.id))
      navigate('/admin/pools', { replace: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start pool cleanup'
      await load()
      setError(message)
    } finally {
      setCleaningPool(false)
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

  async function addInventory() {
    if (!batch) return
    const count = Number(additionCount)
    if (!Number.isInteger(count) || count < 1) {
      setError('Enter at least one additional VTA.')
      return
    }
    setAddingInventory(true)
    setError('')
    try {
      setBatch(await api.addPoolInventory(batch.id, count, crypto.randomUUID()))
      setAdditionCount('')
      setShowAddInventory(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add pool inventory')
      await load()
    } finally {
      setAddingInventory(false)
    }
  }

  async function setPublicSignup(enabled: boolean) {
    if (!batch) return
    setChangingPublicSignup(true)
    setError('')
    try {
      setBatch(enabled
        ? await api.enablePoolPublicSignup(batch.id)
        : await api.disablePoolPublicSignup(batch.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update public signup')
      await load()
    } finally {
      setChangingPublicSignup(false)
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
        {batch && <div className="p-row gap-8 wrap-flex pool-page-actions">
          {batch.purpose === 'public_signup' && (
            <button type="button" className={batch.public_signup_enabled_at ? 'btn btn-outline btn-sm' : 'btn btn-default btn-sm'}
              onClick={() => void setPublicSignup(!batch.public_signup_enabled_at)} disabled={changingPublicSignup}>
              {changingPublicSignup ? 'Updating…' : batch.public_signup_enabled_at ? 'Pause public signup' : 'Resume public signup'}
            </button>
          )}
          <button type="button" className="btn btn-default btn-sm" onClick={() => {
            setError('')
            setAdditionCount('')
            setShowAddInventory(true)
          }} disabled={batch.counts.deleting > 0 || addingInventory}>Add inventory</button>
          <button type="button" className="btn btn-destructive btn-sm" onClick={() => {
            setError('')
            setShowCleanupConfirm(true)
          }} disabled={!canCleanPool || cleaningPool || cleaning} title={cleanPoolTitle}>
            {cleaningPool ? 'Starting cleanup…' : 'Clean up pool'}
          </button>
        </div>}
      </div>

      {error && <div className="p-alert alert-destructive pool-page-error"><div className="grow"><p className="alert-title">Pool operation failed</p><p className="alert-desc">{error}</p></div></div>}
      {loading && !batch ? <div className="p-card"><div className="p-muted pool-empty-row">Loading…</div></div> : batch && (
        <>
          <div className="pool-stats">
            <div className="p-stat"><div className="k">Total</div><div className="v">{batch.counts.total}<small> / {batch.requested_count}</small></div></div>
            <div className="p-stat"><div className="k">Preparing</div><div className="v">{batch.counts.creating}</div></div>
            <div className="p-stat"><div className="k">Available</div><div className="v">{batch.counts.available}</div></div>
            <div className="p-stat"><div className="k">Reserved</div><div className="v">{batch.counts.reserved}</div></div>
            <div className="p-stat"><div className="k">Handed out</div><div className="v">{batch.counts.handed_out}</div></div>
            <div className="p-stat"><div className="k">Failed unclaimed</div><div className="v">{batch.counts.failed_unclaimed}</div></div>
          </div>

          {batch.purpose === 'admin_station' && <ClaimStation batch={batch} onBatchChange={load} />}

          <div className="p-card pool-members-card">
            <div className="card-header with-action">
              <div><h3 className="card-title">Pool members</h3></div>
              <div className="p-row gap-8">
                <button className="btn btn-destructive btn-sm" type="button" onClick={() => {
                    setError('')
                    setShowCleanupConfirm(false)
                    setShowSelectedCleanupConfirm(true)
                  }}
                  disabled={selected.size === 0 || cleaning || cleaningPool}>{cleaning ? 'Starting cleanup…' : `Clean up selected (${selected.size})`}</button>
              </div>
            </div>
            <div className="table-wrap pool-members-table-wrap">
              <table className="p-table pool-members-table">
                <thead><tr><th><SelectAllCheckbox checked={allSelected} indeterminate={someSelected && !allSelected}
                  disabled={cleanable.length === 0} onChange={checked => setSelected(checked
                    ? new Set(cleanable.map(session => session.session_id)) : new Set())} /></th><th>VTA</th><th>Provisioning</th><th>Claim</th><th>Error</th><th /></tr></thead>
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

      {showAddInventory && batch && (
        <div className="p-overlay">
          <div className="p-dialog" role="dialog" aria-modal="true" aria-labelledby="add-pool-inventory-title">
            <div className="dialog-header">
              <h3 className="dialog-title" id="add-pool-inventory-title">Add inventory to {batch.label}</h3>
              <p className="dialog-desc">New VTAs use the same image and appear in this pool as soon as preparation finishes.</p>
            </div>
            <div className="dialog-body p-col gap-12">
              <label className="p-label" htmlFor="pool-add-count">Additional VTAs</label>
              <input id="pool-add-count" className="p-input" type="number" min={1} autoFocus
                value={additionCount} onChange={event => setAdditionCount(event.target.value)} disabled={addingInventory} />
              <p className="p-muted text-sm" style={{ margin: 0 }}>Current total: {batch.counts.total}. Requested total after addition: {batch.requested_count + (Number(additionCount) || 0)}.</p>
              {error && <p className="pool-form-error" role="alert">{error}</p>}
            </div>
            <div className="dialog-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setShowAddInventory(false)} disabled={addingInventory}>Cancel</button>
              <button type="button" className="btn btn-default" onClick={() => void addInventory()} disabled={addingInventory || !Number.isInteger(Number(additionCount)) || Number(additionCount) < 1}>
                {addingInventory ? 'Adding inventory…' : `Add ${Number(additionCount) || 0} VTA${Number(additionCount) === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCleanupConfirm && batch && (
        <div className="p-overlay">
          <div className="p-dialog" role="dialog" aria-modal="true" aria-labelledby="cleanup-pool-title">
            <div className="dialog-header">
              <h3 className="dialog-title" id="cleanup-pool-title">Clean up this pool?</h3>
              <p className="dialog-desc">
                This permanently deletes all <strong>{batch.sessions?.length ?? 0}</strong> unused VTA{batch.sessions?.length === 1 ? '' : 's'} in{' '}
                <span className="p-mono">{batch.label}</span>, their dedicated user accounts, and the pool record. This cannot be undone.
              </p>
            </div>
            {error && <div className="dialog-body"><p className="pool-form-error" role="alert">{error}</p></div>}
            <div className="dialog-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setShowCleanupConfirm(false)} disabled={cleaningPool}>Cancel</button>
              <button type="button" className="btn btn-destructive" onClick={cleanupPool} disabled={cleaningPool || !canCleanPool}>
                {cleaningPool ? 'Starting cleanup…' : 'Clean up pool'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSelectedCleanupConfirm && (
        <div className="p-overlay">
          <div className="p-dialog" role="dialog" aria-modal="true" aria-labelledby="cleanup-selected-title">
            <div className="dialog-header">
              <h3 className="dialog-title" id="cleanup-selected-title">Clean up selected VTAs?</h3>
              <p className="dialog-desc">
                This permanently deletes <strong>{selected.size}</strong> unused pooled VTA{selected.size === 1 ? '' : 's'} and their dedicated user account{selected.size === 1 ? '' : 's'}. This cannot be undone.
              </p>
            </div>
            {error && <div className="dialog-body"><p className="pool-form-error" role="alert">{error}</p></div>}
            <div className="dialog-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setShowSelectedCleanupConfirm(false)} disabled={cleaning}>Cancel</button>
              <button type="button" className="btn btn-destructive" onClick={cleanup} disabled={cleaning || selected.size === 0}>
                {cleaning ? 'Starting cleanup…' : `Clean up selected (${selected.size})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
