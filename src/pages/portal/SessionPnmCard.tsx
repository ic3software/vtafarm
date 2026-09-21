import { useEffect, useState, type FormEvent } from 'react'
import { api, type SessionAcl } from '@/lib/api'
import { isValidAdminDid } from './portalUtils'

interface SessionPnmCardProps {
  sessionId: string
}

function formatAclCreatedAt(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2}:\d{2})$/.exec(value)
  if (!match) return value
  const date = new Date(`${match[1]}T${match[2]}${match[3]}`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export function SessionPnmCard({ sessionId }: SessionPnmCardProps) {
  const [adminDid, setAdminDid] = useState('')
  const [linking, setLinking] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [warning, setWarning] = useState('')
  const [acl, setAcl] = useState<SessionAcl | null>(null)
  const [loadingAcl, setLoadingAcl] = useState(true)
  const [refreshingAcl, setRefreshingAcl] = useState(false)

  useEffect(() => {
    let active = true
    api.getSessionAcl(sessionId)
      .then(result => { if (active) setAcl(result) })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Failed to load the ACL') })
      .finally(() => { if (active) setLoadingAcl(false) })
    return () => { active = false }
  }, [sessionId])

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
      setAdminDid('')
      setNotice(result.already_present
        ? 'This PNM was already an administrator; nothing changed.'
        : 'The additional PNM can now administer this VTA.')
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
    setRefreshingAcl(true)
    try {
      const result = await api.refreshSessionAcl(sessionId)
      setAcl(result)
      setNotice('Live ACL refreshed.')
      if (result.warning) setWarning(result.warning)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh the ACL')
    } finally {
      setRefreshingAcl(false)
    }
  }

  return (
    <div className="p-card">
      <div className="card-header">
        <h3 className="card-title">Link another PNM</h3>
      </div>
      <div className="card-content p-col gap-16">
        <form className="p-col gap-16" onSubmit={handleLink}>
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

          {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{error}</p>}
          {notice && <p role="status" style={{ margin: 0, fontSize: 13, color: 'hsl(var(--foreground))' }}>{notice}</p>}
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
            <button className="btn btn-default" type="submit" disabled={linking || refreshingAcl || !adminDid.trim()}>
              {linking
                ? <><svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width: 14, height: 14 }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Linking — VTA restarting…</>
                : <>Link PNM <span className="arrow">→</span></>}
            </button>
          </div>
        </form>

        <hr className="p-sep" />

        <div className="p-row between center">
          <div>
            <div className="text-sm fw-600">Live ACL</div>
            <div className="p-muted text-xs" style={{ marginTop: 3 }}>
              {acl?.synced_at ? `Synced ${new Date(acl.synced_at).toLocaleString()}` : 'Not synced yet'}
            </div>
          </div>
          <button className="btn btn-outline btn-sm" type="button" onClick={handleRefreshAcl}
            disabled={linking || refreshingAcl}>
            {refreshingAcl
              ? <><svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width: 14, height: 14 }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Refreshing…</>
              : 'Refresh live ACL'}
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
