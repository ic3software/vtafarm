import { useEffect, useRef, useState } from 'react'
import { api, type MobileConnectionState, type SetupSession } from '@/lib/api'
import { isValidAdminDid } from './portalUtils'
import { ConnectionMethodPicker, KeyringConnectionPanel, PnmAdminDidForm, PnmSetupInstructions, VtaDidCopyField, type ConnectionMethod } from './ConnectionMethodUi'

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
  const [method, setMethod] = useState<ConnectionMethod>('automatic')
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
      const expiredAtReceipt = !!connection && (connection.status === 'expired' ||
        (connection.status === 'pending' && Date.parse(connection.expires_at) <= Date.parse(data.server_time)))
      if (connection?.status === 'pending' && connection.callback_url && !expiredAtReceipt) {
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

  function choose(next: ConnectionMethod) {
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
  const requestExpired = !!request && (request.status === 'expired' || (request.status === 'pending' && remaining === 0))
  const hasCurrentQr = !!request && qrPayload?.requestId === request.request_id
  const expired = requestExpired && hasCurrentQr
  const hiddenExpired = requestExpired && !hasCurrentQr
  const qr = method === 'automatic' && request && ['pending', 'expired'].includes(request.status) &&
    request.vta_did === vtaDid && hasCurrentQr && synchronized && online ? qrPayload.value : null
  const automaticMessage = request?.status === 'cancelled' ? null
    : !request || hiddenExpired ? 'Generate a QR code when you are ready.'
    : request.status === 'awaiting_mobile' ? 'Your VTA is ready. Waiting for Keyring to finish connecting.'
    : request?.status === 'provisioning' ? 'Keyring confirmation received. Setting up your VTA…'
    : request?.status === 'failed' ? request.error ?? 'Connection failed. View the setup details for the next step.'
    : expired ? 'This QR code has expired. Generating a replacement requires a new scan.'
    : request.status === 'pending' ? 'Waiting for confirmation in Keyring…'
    : 'Generate a QR code when you are ready.'
  const showKeyringQr = !inProgress && !manualAccepted && ready
  const keyringActionLabel = method === 'automatic' && !inProgress && state?.enabled
    ? busy
      ? 'Generating QR code…'
      : !request || hiddenExpired
        ? 'Generate Keyring QR code'
        : expired
          ? 'Generate replacement QR code'
          : request.status === 'cancelled'
            ? 'Generate new QR code'
            : error
              ? 'Retry QR generation'
              : 'Regenerate QR code'
    : null

  return <div className="p-card" style={{ marginBottom: 20, borderColor: 'hsl(var(--primary)/.35)' }}>
    <div className="card-header">
      <h3 className="card-title">Connect to your Trust Agent</h3>
      <p className="card-desc">Choose Keyring if you want to manage it from your phone, or PNM if from your computer.</p>
    </div>
    <div className="card-content p-col gap-16">
      <ConnectionMethodPicker
        name={`connection-${sessionId}`}
        value={method}
        onChange={choose}
        disabled={busy || loading || inProgress || manualAccepted}
        automaticDisabled={!state?.enabled}
      />
      {loading && <p role="status">Loading connection options…</p>}
      {!online && <p role="status">You are offline. Reconnect to check the current connection.</p>}
      {!loading && !state?.enabled && (
        <p className="p-muted text-sm" role="status" style={{ margin: 0 }}>
          Keyring connection is unavailable in this environment. Connect with PNM instead.
        </p>
      )}
      {method === 'automatic' ? (
        <KeyringConnectionPanel
          message={automaticMessage}
          qr={showKeyringQr ? qr : null}
          expired={showKeyringQr && expired}
          remaining={remaining}
          actionLabel={keyringActionLabel}
          actionDisabled={busy || !online || !ready}
          onAction={() => void generate()}
        />
      ) : manualAccepted ? <p role="status">{session.status === 'failed'
          ? 'VTA setup failed. View the setup details for the next step.'
          : 'Setting up your VTA… Wait on this page. Do not tap “I\'ve been added” in the app yet.'}</p> :
        <PnmSetupInstructions />}
      {notice && <p role="status">{notice}</p>}
      {method !== 'automatic' && <VtaDidCopyField vtaDid={vtaDid} copied={copied} onCopy={() => void copyDid()} />}
      {method !== 'automatic' && !manualAccepted && ready && <PnmAdminDidForm
        id="connection-admin-did"
        value={adminDid}
        onChange={setAdminDid}
        onSubmit={() => void submit()}
        busy={busy}
        inputDisabled={busy || inProgress}
        submitDisabled={busy || inProgress || !adminDid.trim() || !online}
        submitLabel="Connect to VTA"
        busyLabel="Submitting…"
      />}
      {statusError && <p role="status">{statusError}</p>}
      {error && <p role="alert" style={{ color: 'hsl(var(--destructive))' }}>{error}</p>}
    </div>
  </div>
}
