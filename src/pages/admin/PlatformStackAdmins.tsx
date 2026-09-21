import { useCallback, useEffect, useState } from 'react'
import { api, type SessionAcl } from '@/lib/api'
import { isValidAdminDid } from '../portal/portalUtils'

type Notice = { area: 'grant' | 'acl'; message: string }

function formatAclCreatedAt(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2}:\d{2})$/.exec(value)
  if (!match) return value
  const date = new Date(`${match[1]}T${match[2]}${match[3]}`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export function PlatformStackAdmins() {
  const [acl, setAcl] = useState<SessionAcl | null>(null)
  const [loadingAcl, setLoadingAcl] = useState(true)
  const [did, setDid] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [warning, setWarning] = useState('')

  const load = useCallback((force = false) => (
    api.getPlatformStackAdmins(force)
      .then(result => { setAcl(result); setError('') })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load the ACL'))
      .finally(() => setLoadingAcl(false))
  ), [])

  useEffect(() => { void load() }, [load])

  async function handleGrant() {
    const trimmedDid = did.trim()
    const trimmedLabel = label.trim()
    if (!isValidAdminDid(trimmedDid)) {
      setError('Paste only the did:key value (e.g. did:key:z6Mk…) with no surrounding text, labels, quotes, or whitespace.')
      return
    }

    setError(''); setNotice(null); setWarning(''); setBusy(true)
    try {
      const result = await api.grantPlatformStackAdmin({
        did: trimmedDid,
        ...(trimmedLabel ? { label: trimmedLabel } : {}),
      })
      setDid(''); setLabel('')
      setNotice({
        area: 'grant',
        message: result.already_present
          ? 'This PNM was already an administrator; nothing changed.'
          : 'The additional PNM can now administer this VTA.',
      })
      if (result.warning) setWarning(result.warning)
      await load(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add the administrator')
    } finally {
      setBusy(false)
    }
  }

  async function handleRefresh() {
    setError(''); setNotice(null); setWarning(''); setRefreshing(true)
    try {
      const result = await api.refreshPlatformStackAdmins()
      setAcl(result)
      setNotice({ area: 'acl', message: 'Live ACL refreshed.' })
      if (result.warning) setWarning(result.warning)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh the ACL')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="p-card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <h3 className="card-title">Administrators</h3>
      </div>

      <div className="card-content p-col gap-16">
        <div className="p-col gap-12">
          <div>
            <label className="p-label" htmlFor="psa-did">Admin DID</label>
            <input className="p-input p-mono" id="psa-did" type="text" placeholder="did:key:z6Mk…"
              value={did} onChange={event => setDid(event.target.value)} disabled={busy || refreshing} />
          </div>

          <div>
            <label className="p-label" htmlFor="psa-label">Label (Optional)</label>
            <input className="p-input" id="psa-label" type="text" placeholder="alice"
              maxLength={64} value={label} onChange={event => setLabel(event.target.value)} disabled={busy || refreshing} />
          </div>

          {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{error}</p>}
          {notice?.area === 'grant' && <p role="status" style={{ margin: 0, fontSize: 13, color: 'hsl(var(--foreground))' }}>{notice.message}</p>}
          {warning && (
            <div className="p-alert alert-warning" role="alert">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
              <div className="grow">
                <p className="alert-title">ACL maintenance warning</p>
                <p className="alert-desc">{warning}</p>
              </div>
            </div>
          )}

          <div className="p-row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-default" onClick={handleGrant}
              disabled={busy || refreshing || !did.trim()}>
              {busy ? 'Adding — VTA restarting…' : <>Add administrator <span className="arrow">→</span></>}
            </button>
          </div>
        </div>

        <hr className="p-sep" />

        <div className="p-row between center">
          <div>
            <div className="text-sm fw-600">Live ACL</div>
            <div className="p-muted text-xs" style={{ marginTop: 3 }}>
              {acl?.synced_at ? `Synced ${new Date(acl.synced_at).toLocaleString()}` : 'Not synced yet'}
            </div>
            {notice?.area === 'acl' && (
              <div role="status" className="text-xs" style={{ marginTop: 3 }}>{notice.message}</div>
            )}
          </div>
          <button className="btn btn-outline btn-sm" type="button" onClick={handleRefresh}
            disabled={busy || refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh live ACL'}
          </button>
        </div>
        <p className="p-muted text-xs" style={{ margin: 0 }}>Refreshing temporarily stops and restarts the VTA.</p>

        {!loadingAcl && acl?.synced_at && acl.entries.length === 0 && (
          <p className="p-muted text-sm" style={{ margin: 0 }}>No ACL entries.</p>
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
  )
}
