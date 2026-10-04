import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { api, type MobileConnectionState, type SetupSession } from '@/lib/api'
import { isValidAdminDid } from './portalUtils'

type Method = 'local' | 'automatic'
const methods: Array<{ value: Method; label: string }> = [
  { value: 'automatic', label: 'Connect with Keyring' },
  { value: 'local', label: 'Connect with PNM' },
]
const accepted = (state: MobileConnectionState | null) =>
  !!state?.connection && ['provisioning', 'awaiting_mobile', 'connected', 'failed'].includes(state.connection.status)
const restorable = (state: MobileConnectionState) =>
  !!state.connection && ['pending', 'provisioning', 'awaiting_mobile'].includes(state.connection.status)

export function VtaConnectionCard({ session, sessionId, vtaDid, ready, onSessionChange }: {
  session: SetupSession
  sessionId: string
  vtaDid: string
  ready: boolean
  onSessionChange: (session: SetupSession) => void
}) {
  const [method, setMethod] = useState<Method>('automatic')
  const [snapshot, setSnapshot] = useState<{ data: MobileConnectionState; receivedAt: number } | null>(null)
  const [qrPayload, setQrPayload] = useState<{ requestId: string; value: string } | null>(null)
  const [now, setNow] = useState(() => performance.now())
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusError, setStatusError] = useState('')
  const [notice, setNotice] = useState('')
  const [adminDid, setAdminDid] = useState('')
  const [manualAccepted, setManualAccepted] = useState(false)
  const [copied, setCopied] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [synchronized, setSynchronized] = useState(false)
  const sequence = useRef(0)
  const active = useRef(false)
  const mutating = useRef(false)
  const shouldPoll = useRef(true)
  const restored = useRef(false)
  const state = snapshot?.data ?? null
  const request = state?.connection
  const inProgress = accepted(state)
  const remaining = snapshot && request
    ? Math.max(0, Math.ceil((Date.parse(request.expires_at) - Date.parse(snapshot.data.server_time) - (now - snapshot.receivedAt)) / 1000))
    : 0

  function apply(data: MobileConnectionState) {
    const receivedAt = performance.now()
    setQrPayload(current => {
      const connection = data.connection
      if (connection?.status === 'pending' && connection.callback_url) {
        return {
          requestId: connection.request_id,
          value: JSON.stringify({ vta_did: connection.vta_did, callback_url: connection.callback_url }),
        }
      }
      return connection && current?.requestId === connection.request_id ? current : null
    })
    shouldPoll.current = !!data.connection && ['pending', 'provisioning', 'awaiting_mobile'].includes(data.connection.status)
    setSnapshot({ data, receivedAt })
    setNow(receivedAt)
    setSynchronized(true)
    if (!restored.current) setMethod(restorable(data) || data.enabled ? 'automatic' : 'local')
    restored.current = true
  }

  useEffect(() => {
    active.current = true
    restored.current = false
    let disposed = false
    async function sync() {
      if (mutating.current || !navigator.onLine || document.hidden) return
      const version = ++sequence.current
      try {
        const data = await api.getMobileConnection(sessionId)
        if (disposed || version !== sequence.current) return
        apply(data)
        setStatusError('')
      } catch {
        if (!disposed && version === sequence.current) {
          setSynchronized(false)
          setStatusError('Unable to confirm connection status. Retrying…')
        }
      } finally {
        if (!disposed && version === sequence.current) setLoading(false)
      }
    }
    function resume() {
      setOnline(navigator.onLine)
      setSynchronized(false)
      void sync()
    }
    void sync()
    const poll = window.setInterval(() => { if (shouldPoll.current) void sync() }, 3000)
    const clock = window.setInterval(() => setNow(performance.now()), 1000)
    window.addEventListener('online', resume)
    window.addEventListener('offline', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      disposed = true
      active.current = false
      window.clearInterval(poll)
      window.clearInterval(clock)
      window.removeEventListener('online', resume)
      window.removeEventListener('offline', resume)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [sessionId])

  async function mutate(action: () => Promise<MobileConnectionState>, message = '') {
    if (mutating.current) return null
    mutating.current = true
    setBusy(true)
    const version = ++sequence.current
    try {
      const data = await action()
      if (!active.current || version !== sequence.current) return null
      apply(data)
      setError('')
      if (message && data.connection?.status === 'pending') setNotice(message)
      return data
    } catch (err) {
      if (!active.current || version !== sequence.current) return null
      setSynchronized(false)
      setError(err instanceof Error ? err.message : 'Unable to update the connection. Please retry.')
      // A lost response or a competing tab may already have changed the request.
      try {
        const data = await api.getMobileConnection(sessionId)
        if (active.current && version === sequence.current) apply(data)
      } catch { /* Keep the last confirmed state until polling recovers. */ }
      return null
    } finally {
      mutating.current = false
      if (active.current) setBusy(false)
    }
  }

  async function generate() {
    if (!online) return
    if (request) {
      await mutate(() => api.refreshMobileConnection(sessionId, request.request_id), 'The previous QR code is no longer valid. Please scan the new QR code.')
    } else {
      await mutate(() => api.createMobileConnection(sessionId))
    }
  }

  function choose(next: Method) {
    if (busy || manualAccepted || inProgress) return
    setMethod(next)
    setError('')
    setNotice('')
  }

  async function submit() {
    const did = adminDid.trim()
    if (mutating.current || manualAccepted || inProgress) return
    if (did.length > 128 || !isValidAdminDid(did)) { setError('Paste only the valid did:key value provided by your identity tool.'); return }
    mutating.current = true
    setBusy(true)
    const version = ++sequence.current
    try {
      await api.provisionAdmin(sessionId, did)
      if (!active.current || version !== sequence.current) return
      setManualAccepted(true)
      setError('')
    } catch (err) {
      if (active.current && version === sequence.current) setError(err instanceof Error ? err.message : 'Unable to submit the Admin DID.')
    } finally {
      try {
        const updated = await api.getSession(sessionId)
        if (active.current && version === sequence.current) {
          onSessionChange(updated)
          if (!['vta_setup_complete', 'awaiting_admin_did'].includes(updated.status)) setManualAccepted(true)
        }
      } catch { /* Existing polling restores progress after a network failure. */ }
      mutating.current = false
      if (active.current) setBusy(false)
    }
  }

  async function copyDid() {
    try { await navigator.clipboard.writeText(vtaDid); setCopied(true) }
    catch { setError('Unable to copy. Select and copy the VTA DID below.') }
  }

  if ((manualAccepted && session.status === 'running') || request?.status === 'connected') {
    return (
      <div className="p-alert alert-success" role="status" style={{ marginBottom: 20 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <div className="grow">
          <p className="alert-title">Connection ready</p>
          <p className="alert-desc">
            {request?.status === 'connected'
              ? 'Your device is connected to this VTA through Keyring.'
              : 'VTA Farm has finished connecting this administrator. Return to the app and tap “I\'ve been added”.'}
          </p>
        </div>
      </div>
    )
  }

  if (!ready && !request && !manualAccepted) {
    if (session.status === 'running' || session.status === 'failed') return null
    return null
  }
  const expired = !!request && (request.status === 'expired' || (request.status === 'pending' && remaining === 0))
  const qr = method === 'automatic' && request && ['pending', 'expired'].includes(request.status) &&
    request.vta_did === vtaDid && qrPayload?.requestId === request.request_id && synchronized && online ? qrPayload.value : null
  const automaticMessage = !request ? 'Generate a QR code when you are ready.'
    : request.status === 'awaiting_mobile' ? 'Your VTA is ready. Waiting for Keyring to finish connecting.'
    : request?.status === 'provisioning' ? 'Keyring confirmation received. Setting up your VTA…'
    : request?.status === 'failed' ? request.error ?? 'Connection failed. View the setup details for the next step.'
    : expired ? 'This QR code has expired. Generating a replacement requires a new scan.'
    : 'Waiting for confirmation in Keyring…'

  return <div className="p-card" style={{ marginBottom: 20, borderColor: 'hsl(var(--primary)/.35)' }}>
    <div className="card-header">
      <h3 className="card-title">Connect to your VTA</h3>
      <p className="card-desc">Choose the setup that matches where you keep your administrator identity.</p>
    </div>
    <div className="card-content p-col gap-16">
      <fieldset style={{ border: 0, padding: 0, margin: 0 }} disabled={busy || loading || inProgress || manualAccepted}>
        <legend className="p-label">How would you like to connect?</legend>
        <div className="p-row gap-12 wrap-flex">
          {methods.map(option => <label key={option.value} className="p-row gap-8 wrap-flex" style={{ cursor: option.value === 'automatic' && !state?.enabled ? 'not-allowed' : 'pointer' }}>
            <input type="radio" name={`connection-${sessionId}`} value={option.value} checked={method === option.value} disabled={option.value === 'automatic' && !state?.enabled} onChange={() => void choose(option.value)} />
            {option.label}
            {option.value === 'automatic' && <span className="p-badge badge-default">Recommended</span>}
          </label>)}
        </div>
      </fieldset>
      {loading && <p role="status">Loading connection options…</p>}
      {!online && <p role="status">You are offline. Reconnect to check the current connection.</p>}
      {!loading && !state?.enabled && (
        <p className="p-muted text-sm" role="status" style={{ margin: 0 }}>
          Keyring connection is unavailable in this environment. Connect with PNM instead.
        </p>
      )}
      {method === 'automatic' ? !expired && <p role="status" aria-live="polite">{automaticMessage}</p> : manualAccepted ? <p role="status">{session.status === 'failed'
          ? 'VTA setup failed. View the setup details for the next step.'
          : 'Setting up your VTA… Wait on this page. Do not tap “I\'ve been added” in the app yet.'}</p> :
        <p style={{ margin: 0 }}>Run <span className="p-mono">pnm setup</span> on this computer, then paste the Admin DID it generates below.</p>}
      {(qr || expired) && !inProgress && !manualAccepted && ready && <div className="connection-qr">
        <div className={`connection-qr-code${expired ? ' is-expired' : ''}`}>
          {qr
            ? <QRCodeSVG value={qr} size={280} level="M" marginSize={4} title="Keyring connection QR code" />
            : <div className="qr-expired-placeholder" aria-hidden="true" />}
          {expired && <span className="qr-expired-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="m6 6 12 12M18 6 6 18"/></svg>
          </span>}
        </div>
        {expired ? (
          <p className="qr-expired-message" role="status" aria-live="polite">
            <strong>QR code expired</strong>
            <span>Click “Generate replacement QR code” below to create a new one.</span>
          </p>
        ) : request?.status === 'pending' && (
          <p className="qr-expiry" aria-live="off">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
            QR code expires in <strong>{Math.floor(remaining / 60).toString().padStart(2, '0')}:{(remaining % 60).toString().padStart(2, '0')}</strong>
          </p>
        )}
      </div>}
      {notice && <p role="status">{notice}</p>}
      {method !== 'automatic' && <div className="connection-did-field">
        <span className="p-label">VTA DID</span>
        <div className="p-row gap-12" style={{ alignItems: 'center' }}>
          <p className="p-mono text-xs" style={{ minWidth: 0, flex: 1, margin: 0, overflowWrap: 'anywhere' }}>{vtaDid}</p>
          <button className="btn btn-outline btn-sm" onClick={() => void copyDid()}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
      </div>}
      {method !== 'automatic' && !manualAccepted && ready && <form onSubmit={e => { e.preventDefault(); void submit() }} className="p-col gap-12">
        <label className="p-label" htmlFor="connection-admin-did">Admin DID</label>
        <input id="connection-admin-did" className="p-input p-mono" placeholder="did:key:z6Mk…" maxLength={128} value={adminDid} onChange={e => setAdminDid(e.target.value)} disabled={busy || inProgress} required />
        <button className="btn btn-default" disabled={busy || inProgress || !adminDid.trim() || !online}>{busy ? 'Submitting…' : 'Connect to VTA'}</button>
      </form>}
      {method === 'automatic' && !inProgress && state?.enabled && <button className="btn btn-outline" disabled={busy || !online || !ready} onClick={() => void generate()}>{busy ? 'Generating QR code…' : !request ? 'Generate Keyring QR code' : expired ? 'Generate replacement QR code' : error ? 'Retry QR generation' : 'Regenerate QR code'}</button>}
      {statusError && <p role="status">{statusError}</p>}
      {error && <p role="alert" style={{ color: 'hsl(var(--destructive))' }}>{error}</p>}
    </div>
  </div>
}
