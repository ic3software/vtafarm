import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { api, type MobileConnectionState, type SetupSession } from '@/lib/api'
import { isValidAdminDid } from './portalUtils'

type Method = 'local' | 'manual' | 'automatic'
const methods: Array<{ value: Method; label: string }> = [
  { value: 'local', label: 'Local Connection' },
  { value: 'manual', label: 'Scan and Connect Manually' },
  { value: 'automatic', label: 'Automatic Mobile Connection' },
]
const accepted = (state: MobileConnectionState | null) =>
  !!state?.connection && ['provisioning', 'awaiting_mobile', 'connected', 'failed'].includes(state.connection.status)

export function VtaConnectionCard({ session, sessionId, vtaDid, ready, onSessionChange }: {
  session: SetupSession
  sessionId: string
  vtaDid: string
  ready: boolean
  onSessionChange: (session: SetupSession) => void
}) {
  const [method, setMethod] = useState<Method>('local')
  const [snapshot, setSnapshot] = useState<{ data: MobileConnectionState; receivedAt: number } | null>(null)
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
  const refreshAttempt = useRef('')
  const state = snapshot?.data ?? null
  const request = state?.connection
  const inProgress = accepted(state)
  const remaining = snapshot && request
    ? Math.max(0, Math.ceil((Date.parse(request.expires_at) - Date.parse(snapshot.data.server_time) - (now - snapshot.receivedAt)) / 1000))
    : 0

  function apply(data: MobileConnectionState) {
    const receivedAt = performance.now()
    setSnapshot({ data, receivedAt })
    setNow(receivedAt)
    setSynchronized(true)
    if (accepted(data)) setMethod('automatic')
  }

  useEffect(() => {
    active.current = true
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
    const poll = window.setInterval(() => void sync(), 3000)
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
      refreshAttempt.current = request.request_id
      await mutate(() => api.refreshMobileConnection(sessionId, request.request_id), 'The previous QR code is no longer valid. Please scan the new QR code.')
    } else {
      await mutate(() => api.createMobileConnection(sessionId))
    }
  }

  useEffect(() => {
    if (method !== 'automatic' || !state?.enabled || !online || !synchronized || busy || document.hidden || !request || !['pending', 'expired'].includes(request.status) || remaining > 0 || refreshAttempt.current === request.request_id) return
    refreshAttempt.current = request.request_id
    void generate()
    // generate uses the request represented by these dependencies. The ref
    // prevents an automatic retry loop when replacement fails.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, state?.enabled, online, synchronized, busy, request?.request_id, request?.status, remaining])

  async function choose(next: Method) {
    if (busy || manualAccepted || inProgress) return
    if (next !== 'automatic' && request && ['pending', 'expired'].includes(request.status)) {
      const data = await mutate(() => api.cancelMobileConnection(sessionId, request.request_id))
      if (!data || accepted(data)) return
    }
    setMethod(next)
    setError('')
    setNotice('')
    if (next === 'automatic') await mutate(() => api.createMobileConnection(sessionId))
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
              ? 'Your phone is connected to this VTA.'
              : 'VTA Farm has finished connecting this administrator. Return to the app and tap “I\'ve been added”.'}
          </p>
        </div>
      </div>
    )
  }

  if (!ready && !request && !manualAccepted) {
    if (session.status === 'running' || session.status === 'failed') return null
    return <div className="p-card"><div className="card-content">Preparing your VTA. You can connect when it is ready.</div></div>
  }
  const expired = !!request && (request.status === 'expired' || (request.status === 'pending' && remaining === 0))
  const qr = method === 'manual' ? vtaDid : method === 'automatic' && request?.callback_url && request.vta_did === vtaDid && !expired && synchronized && online
    ? JSON.stringify({ vta_did: request.vta_did, callback_url: request.callback_url }) : null
  const automaticMessage = request?.status === 'awaiting_mobile' ? 'Your VTA is ready. Waiting for your phone to finish connecting.'
    : request?.status === 'provisioning' ? 'Phone confirmation received. Setting up your VTA…'
    : request?.status === 'failed' ? request.error ?? 'Connection failed. View the setup details for the next step.'
    : expired ? 'This QR code has expired. Generating a replacement requires a new scan.'
    : 'Waiting for confirmation from your phone…'

  return <div className="p-card" style={{ marginBottom: 20, borderColor: 'hsl(var(--primary)/.35)' }}>
    <div className="card-header">
      <h3 className="card-title">Connect to your VTA</h3>
    </div>
    <div className="card-content p-col gap-16">
      <fieldset style={{ border: 0, padding: 0, margin: 0 }} disabled={busy || loading || inProgress || manualAccepted}>
        <legend className="p-label">Connection method</legend>
        <div className="p-row gap-12 wrap-flex">
          {methods.map(option => <label key={option.value} className="p-row gap-8" style={{ cursor: 'pointer' }}>
            <input type="radio" name={`connection-${sessionId}`} value={option.value} checked={method === option.value} disabled={option.value === 'automatic' && !state?.enabled} onChange={() => void choose(option.value)} />
            {option.label}{option.value === 'automatic' ? ' (Testing)' : ''}
          </label>)}
        </div>
      </fieldset>
      {loading && <p role="status">Loading connection options…</p>}
      {!online && <p role="status">You are offline. Reconnect to check the current connection.</p>}
      {method === 'automatic' ? <>
        <p>Scan with a compatible mobile app and confirm on your phone. You do not need to paste an Admin DID here.</p>
        <p role="status" aria-live="polite">{automaticMessage}</p>
      </> : manualAccepted ? <p role="status">{session.status === 'failed'
          ? 'VTA setup failed. View the setup details for the next step.'
          : 'Setting up your VTA… Wait on this page. Do not tap “I\'ve been added” in the app yet.'}</p> :
        method === 'manual' ? <ol style={{ paddingLeft: 20, margin: 0, listStyleType: 'decimal' }}>
          <li>Scan the QR code with your mobile app.</li>
          <li>In the app, copy or share the displayed code, then paste it into Admin DID below.</li>
          <li>Select Connect to VTA on this page.</li>
          <li>Wait here until VTA Farm confirms it has finished. Do not tap <strong>I’ve been added</strong> in the app yet.</li>
          <li>Return to the app and tap <strong>I’ve been added</strong>.</li>
        </ol> : <p>Run <span className="p-mono">pnm setup</span> locally and paste the Admin DID it provides.</p>}
      {qr && !inProgress && !manualAccepted && ready && <div style={{ alignSelf: 'center', maxWidth: '100%' }}>
        <QRCodeSVG value={qr} size={280} level="M" marginSize={4} title={method === 'manual' ? 'VTA DID QR code' : 'VTA mobile connection QR code'} style={{ maxWidth: '100%', height: 'auto', background: '#fff' }} />
      </div>}
      {method === 'automatic' && request?.status === 'pending' && !expired && <p className="p-muted" aria-live="off">QR code expires in {Math.floor(remaining / 60).toString().padStart(2, '0')}:{(remaining % 60).toString().padStart(2, '0')}</p>}
      {notice && <p role="status">{notice}</p>}
      <div>
        <span className="p-label">VTA DID</span>
        <div className="p-row gap-12" style={{ alignItems: 'center' }}>
          <p className="p-mono text-xs" style={{ minWidth: 0, flex: 1, margin: 0, overflowWrap: 'anywhere' }}>{vtaDid}</p>
          <button className="btn btn-outline btn-sm" onClick={() => void copyDid()}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
      </div>
      {method !== 'automatic' && !manualAccepted && ready && <form onSubmit={e => { e.preventDefault(); void submit() }} className="p-col gap-12">
        <label className="p-label" htmlFor="connection-admin-did">Admin DID</label>
        <input id="connection-admin-did" className="p-input p-mono" placeholder="did:key:z6Mk…" maxLength={128} value={adminDid} onChange={e => setAdminDid(e.target.value)} disabled={busy || inProgress} required />
        <button className="btn btn-default" disabled={busy || inProgress || !adminDid.trim() || !online}>{busy ? 'Submitting…' : 'Connect to VTA'}</button>
      </form>}
      {method === 'automatic' && !inProgress && state?.enabled && <button className="btn btn-outline" disabled={busy || !online || !ready} onClick={() => void generate()}>{busy ? 'Generating QR code…' : expired || error ? 'Retry QR generation' : 'Generate new QR code'}</button>}
      {statusError && <p role="status">{statusError}</p>}
      {error && <p role="alert" style={{ color: 'hsl(var(--destructive))' }}>{error}</p>}
    </div>
  </div>
}
