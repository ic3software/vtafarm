import { useEffect, useRef, useState, type FormEvent } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { api, type MobileConnectionState, type SessionAcl } from '@/lib/api'
import { isValidAdminDid } from './portalUtils'

interface SessionPnmCardProps {
  sessionId: string
  vtaDid: string
  onVtaRestarted: () => void
}

type ConnectionMethod = 'local' | 'automatic'

const connectionMethods: Array<{ value: ConnectionMethod; label: string }> = [
  { value: 'automatic', label: 'Connect with Keyring' },
  { value: 'local', label: 'Connect with PNM' },
]

function formatAclCreatedAt(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2}:\d{2})$/.exec(value)
  if (!match) return value
  const date = new Date(`${match[1]}T${match[2]}${match[3]}`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export function SessionPnmCard({ sessionId, vtaDid, onVtaRestarted }: SessionPnmCardProps) {
  const [method, setMethod] = useState<ConnectionMethod>('automatic')
  const [adminDid, setAdminDid] = useState('')
  const [linking, setLinking] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [warning, setWarning] = useState('')
  const [acl, setAcl] = useState<SessionAcl | null>(null)
  const [loadingAcl, setLoadingAcl] = useState(true)
  const [refreshingAcl, setRefreshingAcl] = useState(false)
  const [aclNotice, setAclNotice] = useState('')
  const [aclError, setAclError] = useState('')
  const [aclWarning, setAclWarning] = useState('')
  const [copied, setCopied] = useState(false)
  const [mobileSnapshot, setMobileSnapshot] = useState<{ data: MobileConnectionState; receivedAt: number } | null>(null)
  const [mobileQrPayload, setMobileQrPayload] = useState<{ requestId: string; value: string } | null>(null)
  const [mobileNow, setMobileNow] = useState(() => performance.now())
  const [mobileLoading, setMobileLoading] = useState(true)
  const [mobileBusy, setMobileBusy] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [mobileSynchronized, setMobileSynchronized] = useState(false)
  const mobileSequence = useRef(0)
  const mobileActive = useRef(false)
  const mobileMutating = useRef(false)
  const mobileShouldPoll = useRef(true)
  const mobileRestored = useRef(false)
  const mobileState = mobileSnapshot?.data ?? null
  const mobileRequest = mobileState?.connection
  const mobileProvisioning = mobileRequest?.status === 'provisioning'
  const mobileRemaining = mobileSnapshot && mobileRequest
    ? Math.max(0, Math.ceil((Date.parse(mobileRequest.expires_at) - Date.parse(mobileSnapshot.data.server_time) - (mobileNow - mobileSnapshot.receivedAt)) / 1000))
    : 0

  function applyMobileState(data: MobileConnectionState) {
    const receivedAt = performance.now()
    setMobileQrPayload(current => {
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
    mobileShouldPoll.current = !!data.connection && ['pending', 'provisioning', 'awaiting_mobile'].includes(data.connection.status)
    setMobileSnapshot({ data, receivedAt })
    setMobileNow(receivedAt)
    setMobileSynchronized(true)
    if (!mobileRestored.current) {
      const activeRequest = data.connection && ['pending', 'provisioning', 'awaiting_mobile'].includes(data.connection.status)
      setMethod(activeRequest || data.enabled ? 'automatic' : 'local')
    }
    mobileRestored.current = true
  }

  useEffect(() => {
    let active = true
    api.getSessionAcl(sessionId)
      .then(result => { if (active) setAcl(result) })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Failed to load the ACL') })
      .finally(() => { if (active) setLoadingAcl(false) })
    return () => { active = false }
  }, [sessionId])

  useEffect(() => {
    mobileActive.current = true
    mobileRestored.current = false
    let disposed = false
    async function sync() {
      if (mobileMutating.current || !navigator.onLine || document.hidden) return
      const version = ++mobileSequence.current
      try {
        const data = await api.getMobileConnection(sessionId)
        if (disposed || version !== mobileSequence.current) return
        applyMobileState(data)
      } catch {
        if (!disposed && version === mobileSequence.current) setMobileSynchronized(false)
      } finally {
        if (!disposed && version === mobileSequence.current) setMobileLoading(false)
      }
    }
    function resume() {
      setOnline(navigator.onLine)
      setMobileSynchronized(false)
      void sync()
    }
    void sync()
    const poll = window.setInterval(() => { if (mobileShouldPoll.current) void sync() }, 3000)
    const clock = window.setInterval(() => setMobileNow(performance.now()), 1000)
    window.addEventListener('online', resume)
    window.addEventListener('offline', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      disposed = true
      mobileActive.current = false
      window.clearInterval(poll)
      window.clearInterval(clock)
      window.removeEventListener('online', resume)
      window.removeEventListener('offline', resume)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [sessionId])

  async function mutateMobile(action: () => Promise<MobileConnectionState>) {
    if (mobileMutating.current) return null
    mobileMutating.current = true
    setMobileBusy(true)
    const version = ++mobileSequence.current
    try {
      const data = await action()
      if (!mobileActive.current || version !== mobileSequence.current) return null
      applyMobileState(data)
      setError('')
      return data
    } catch (err) {
      if (mobileActive.current && version === mobileSequence.current) {
        setError(err instanceof Error ? err.message : 'Unable to update the mobile connection.')
        setMobileSynchronized(false)
      }
      return null
    } finally {
      mobileMutating.current = false
      if (mobileActive.current) setMobileBusy(false)
    }
  }

  async function generateMobileQr() {
    if (!online) return
    setNotice('')
    setWarning('')
    if (mobileRequest) {
      await mutateMobile(() => api.refreshMobileConnection(sessionId, mobileRequest.request_id))
    } else {
      await mutateMobile(() => api.createMobileConnection(sessionId))
    }
  }

  async function handleLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = adminDid.trim()

    if (!isValidAdminDid(trimmed)) {
      setError('Paste only the did:key value (e.g. did:key:z6Mk…) with no surrounding text, labels, quotes, or whitespace.')
      setNotice('')
      setWarning('')
      return
    }

    setError('')
    setNotice('')
    setWarning('')
    setLinking(true)
    try {
      const result = await api.addSessionAdmin(sessionId, trimmed)
      onVtaRestarted()
      setAdminDid('')
      setNotice(result.already_present
        ? 'VTA Farm confirms this phone is already an administrator. Return to the app and tap “I\'ve been added”.'
        : 'VTA Farm has finished adding this phone. Return to the app and tap “I\'ve been added”.')
      if (result.warning) setWarning(result.warning)
      try {
        setAcl(await api.getSessionAcl(sessionId, true))
      } catch (refreshErr) {
        setError(refreshErr instanceof Error
          ? `The PNM was linked, but the ACL list could not reload: ${refreshErr.message}`
          : 'The PNM was linked, but the ACL list could not reload.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link the PNM')
    } finally {
      setLinking(false)
    }
  }

  async function handleRefreshAcl() {
    setError('')
    setNotice('')
    setWarning('')
    setAclNotice('')
    setAclError('')
    setAclWarning('')
    setRefreshingAcl(true)
    try {
      const result = await api.refreshSessionAcl(sessionId)
      onVtaRestarted()
      setAcl(result)
      setAclNotice('Connected devices are up to date.')
      if (result.warning) setAclWarning(result.warning)
    } catch (err) {
      setAclError(err instanceof Error ? err.message : 'Failed to refresh the ACL')
    } finally {
      setRefreshingAcl(false)
    }
  }

  async function copyVtaDid() {
    try {
      await navigator.clipboard.writeText(vtaDid)
      setCopied(true)
    } catch {
      setError('Unable to copy. Select and copy the VTA DID below.')
    }
  }

  async function chooseMethod(next: ConnectionMethod) {
    if (linking || refreshingAcl || mobileBusy || mobileProvisioning) return
    if (next !== 'automatic' && mobileRequest?.status === 'awaiting_mobile') {
      const data = await mutateMobile(() => api.cancelMobileConnection(sessionId, mobileRequest.request_id))
      if (!data) return
    }
    setMethod(next)
    setError('')
    setNotice('')
    setWarning('')
  }

  const mobileRequestExpired = !!mobileRequest && (mobileRequest.status === 'expired' || (mobileRequest.status === 'pending' && mobileRemaining === 0))
  const hasCurrentMobileQr = !!mobileRequest && mobileQrPayload?.requestId === mobileRequest.request_id
  const mobileExpired = mobileRequestExpired && hasCurrentMobileQr
  const hiddenMobileExpired = mobileRequestExpired && !hasCurrentMobileQr
  const automaticQr = method === 'automatic' && mobileRequest && ['pending', 'expired'].includes(mobileRequest.status) &&
    mobileRequest.vta_did === vtaDid && hasCurrentMobileQr && mobileSynchronized && online ? mobileQrPayload.value : null
  const automaticMessage = mobileRequest?.status === 'cancelled' ? null
    : !mobileRequest || hiddenMobileExpired ? 'Generate a QR code when you are ready.'
    : mobileRequest.status === 'connected' ? 'Keyring is connected. You can generate another QR code for a different device.'
    : mobileRequest?.status === 'awaiting_mobile' ? 'The administrator was added. Waiting for Keyring to finish connecting.'
    : mobileRequest?.status === 'provisioning' ? 'Keyring confirmation received. Adding the administrator and restarting your VTA…'
    : mobileRequest?.status === 'failed' ? mobileRequest.error ?? 'Connection failed. Generate a new QR code and try again.'
    : mobileExpired ? 'This QR code has expired. Generate a replacement and scan it again.'
    : mobileRequest.status === 'pending' ? 'Waiting for confirmation in Keyring…'
    : 'Generate a QR code when you are ready.'

  return (
    <div className="session-connections-layout">
      {!loadingAcl && acl?.synced_at && acl.entries.length === 0 && (
        <div className="p-alert alert-info session-connections-empty" role="status">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M5 12h14"/></svg>
          <div className="grow">
            <p className="alert-title">No connected devices yet</p>
            <p className="alert-desc">Choose a connection method below to add the first device shown in this VTA’s ACL.</p>
          </div>
        </div>
      )}

      <div className="p-card" style={{ borderColor: 'hsl(var(--primary)/.35)' }}>
        <div className="card-header">
          <h3 className="card-title">Connect another device</h3>
        </div>
        <div className="card-content p-col gap-16">
        <fieldset style={{ border: 0, padding: 0, margin: 0 }} disabled={linking || refreshingAcl || mobileBusy || mobileProvisioning}>
          <legend className="p-label">How would you like to connect?</legend>
          <div className="p-row gap-12 wrap-flex">
            {connectionMethods.map(option => (
              <label key={option.value} className="p-row gap-8" style={{ cursor: option.value === 'automatic' && !mobileState?.enabled ? 'not-allowed' : 'pointer' }}>
                <input
                  type="radio"
                  name={`additional-connection-${sessionId}`}
                  value={option.value}
                  checked={method === option.value}
                  disabled={option.value === 'automatic' && (mobileLoading || !mobileState?.enabled)}
                  onChange={() => void chooseMethod(option.value)}
                />
                {option.label}
                {option.value === 'automatic' && <span className="p-badge badge-default">Recommended</span>}
              </label>
            ))}
          </div>
        </fieldset>

        {!mobileLoading && !mobileState?.enabled && (
          <p className="p-muted text-sm" role="status" style={{ margin: 0 }}>
            Keyring connection is unavailable in this environment. Connect with PNM instead.
          </p>
        )}

        {method === 'automatic' ? !mobileExpired && automaticMessage && (
          <p role="status" aria-live="polite" style={{ margin: 0 }}>{automaticMessage}</p>
        ) : (
          <p style={{ margin: 0 }}>Run <code className="connection-command">pnm setup</code> on this computer, then paste the Admin DID it generates below.</p>
        )}

        {(automaticQr || mobileExpired) && (
          <div className="connection-qr">
            <div className={`connection-qr-code${mobileExpired ? ' is-expired' : ''}`}>
              {automaticQr
                ? <QRCodeSVG value={automaticQr} size={280} level="M" marginSize={4} title="Keyring connection QR code" />
                : <div className="qr-expired-placeholder" aria-hidden="true" />}
              {mobileExpired && <span className="qr-expired-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="m6 6 12 12M18 6 6 18"/></svg>
              </span>}
            </div>
            {mobileExpired ? (
              <p className="qr-expired-message" role="status" aria-live="polite">
                <strong>QR code expired</strong>
                <span>Click “Generate replacement QR code” below to create a new one.</span>
              </p>
            ) : mobileRequest?.status === 'pending' && (
              <p className="qr-expiry" aria-live="off">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                QR code expires in <strong>{Math.floor(mobileRemaining / 60).toString().padStart(2, '0')}:{(mobileRemaining % 60).toString().padStart(2, '0')}</strong>
              </p>
            )}
          </div>
        )}

        {method !== 'automatic' && <div className="connection-did-field">
          <span className="p-label">VTA DID</span>
          <div className="p-row gap-12" style={{ alignItems: 'center' }}>
            <p className="p-mono text-xs" style={{ minWidth: 0, flex: 1, margin: 0, overflowWrap: 'anywhere' }}>{vtaDid}</p>
            <button className="btn btn-outline btn-sm" type="button" onClick={() => void copyVtaDid()}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>}

        {method !== 'automatic' && <form className="p-col gap-16" onSubmit={handleLink}>
          <div>
            <label className="p-label" htmlFor="additional-pnm-did">Admin DID</label>
            <input
              id="additional-pnm-did"
              className="p-input p-mono"
              type="text"
              placeholder="did:key:z6Mk…"
              value={adminDid}
              onChange={event => setAdminDid(event.target.value)}
              disabled={linking || refreshingAcl}
            />
          </div>
          <div className="p-row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-default" type="submit" disabled={linking || refreshingAcl || !adminDid.trim()}>
              {linking
                ? <><svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width: 14, height: 14 }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Linking — VTA restarting…</>
                : <>Link PNM <span className="arrow">→</span></>}
            </button>
          </div>
        </form>}

        {method === 'automatic' && mobileState?.enabled && !mobileProvisioning && (mobileRequest?.status !== 'pending' || mobileRequestExpired) && (
          <div className="p-row" style={{ justifyContent: 'flex-start' }}>
            <button className="btn btn-outline" type="button" disabled={mobileBusy || !online} onClick={() => void generateMobileQr()}>
              {mobileBusy ? 'Generating QR code…' : !mobileRequest || hiddenMobileExpired ? 'Generate Keyring QR code' : mobileExpired ? 'Generate replacement QR code' : mobileRequest.status === 'awaiting_mobile' ? 'Regenerate QR code' : 'Generate new QR code'}
            </button>
          </div>
        )}

        {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{error}</p>}
        {notice && (
          <div className="p-alert alert-success" role="status">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <div className="grow">
              <p className="alert-title">Connection ready</p>
              <p className="alert-desc">{notice}</p>
            </div>
          </div>
        )}
        {warning && (
          <div className="p-alert alert-warning" role="alert">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
            <div className="grow">
              <p className="alert-title">ACL maintenance warning</p>
              <p className="alert-desc">{warning}</p>
            </div>
          </div>
        )}
        </div>
      </div>

      <div className="p-card">
        <div className="card-header with-action">
          <div>
            <h3 className="card-title">Connected devices</h3>
          </div>
          <button className="btn btn-outline btn-sm" type="button" onClick={handleRefreshAcl}
            disabled={linking || refreshingAcl}>
            {refreshingAcl
              ? <><svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width: 14, height: 14 }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Refreshing…</>
              : 'Refresh ACL'}
          </button>
        </div>
        <div className="card-content p-col gap-12" style={{ paddingTop: 14 }}>
          <p className="p-muted text-xs" style={{ margin: 0 }}>
            {acl?.synced_at ? `Synced ${new Date(acl.synced_at).toLocaleString()}.` : 'Not synced yet.'}
          </p>

          {aclNotice && (
            <div className="p-alert alert-success" role="status">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <div className="grow">
                <p className="alert-title">ACL refreshed</p>
                <p className="alert-desc">{aclNotice}</p>
              </div>
            </div>
          )}
          {aclError && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{aclError}</p>}
          {aclWarning && (
            <div className="p-alert alert-warning" role="alert">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
              <div className="grow">
                <p className="alert-title">ACL maintenance warning</p>
                <p className="alert-desc">{aclWarning}</p>
              </div>
            </div>
          )}

          {loadingAcl && <p className="p-muted text-sm" style={{ margin: 0 }}>Loading ACL…</p>}

          {!loadingAcl && acl?.synced_at && acl.entries.length === 0 && (
            <div className="p-empty session-acl-empty">
              <h3>No devices in the ACL</h3>
              <p>Connect a local PNM or Keyring to add a Super Admin.</p>
            </div>
          )}

          {acl && acl.entries.length > 0 && (
            <div className="p-col gap-8">
              {acl.entries.map(entry => (
                <div key={entry.did} style={{ border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', padding: '10px 12px' }}>
                  <div className="p-row between center gap-8">
                    <span className="text-sm fw-600">{entry.label || 'Unlabeled'}</span>
                    <span className="p-badge badge-secondary">{entry.role}</span>
                  </div>
                  <div className="p-muted text-xs" style={{ marginTop: 8 }}>Full DID</div>
                  <div className="p-mono text-xs" style={{ marginTop: 5, width: '100%', whiteSpace: 'normal', wordBreak: 'break-all', overflow: 'visible' }}>
                    {entry.did}
                  </div>
                  <div className="p-muted text-xs" style={{ marginTop: 5 }}>Contexts: {entry.contexts}</div>
                  <div className="p-muted text-xs" style={{ marginTop: 3 }}>Created: {formatAclCreatedAt(entry.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
