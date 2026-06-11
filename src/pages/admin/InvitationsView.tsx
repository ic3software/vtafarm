import { useState, useEffect, useCallback } from 'react'
import { api, type Invitation } from '@/lib/api'

const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: browserTz })
}

function inviteUrl(token: string) {
  return `${window.location.origin}/register/${token}`
}

function statusBadge(inv: Invitation) {
  if (inv.used_at) {
    return <span className="p-badge" style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', borderColor: 'transparent', fontSize: 11 }}>Used</span>
  }
  if (new Date(inv.expires_at) < new Date()) {
    return <span className="p-badge" style={{ background: 'hsl(var(--destructive) / .12)', color: 'hsl(var(--destructive))', borderColor: 'hsl(var(--destructive) / .25)', fontSize: 11 }}>Expired</span>
  }
  return <span className="p-badge badge-default" style={{ background: 'hsl(142 72% 50% / .15)', color: 'hsl(142 72% 38%)', borderColor: 'hsl(142 72% 50% / .3)', fontSize: 11 }}>Active</span>
}

export function InvitationsView() {
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newInvite, setNewInvite] = useState<{ token: string; expires_at: string } | null>(null)
  const [copiedId, setCopiedId] = useState<number | 'modal' | null>(null)
  const [createError, setCreateError] = useState('')

  const loadInvitations = useCallback(() => {
    setLoading(true)
    api.listInvitations().then(setInvitations).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadInvitations() }, [loadInvitations])

  async function handleCreate() {
    setCreateError('')
    setCreating(true)
    try {
      const result = await api.createInvitation()
      setNewInvite({ token: result.token, expires_at: result.expires_at })
      loadInvitations()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create invitation')
    } finally {
      setCreating(false)
    }
  }

  async function copyLink(token: string, id: number | 'modal') {
    await navigator.clipboard.writeText(inviteUrl(token))
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <section className="p-content">
      <div className="page-head">
        <div>
          <h1>Invitations</h1>
          <p className="sub">Single-use links that let new users register. Each link expires in 24 hours.</p>
        </div>
        <button className="btn btn-default" onClick={handleCreate} disabled={creating}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          {creating ? 'Generating…' : 'Generate link'}
        </button>
      </div>

      {createError && (
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'hsl(var(--destructive))' }}>{createError}</p>
      )}

      <div className="table-wrap">
        <table className="p-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Status</th>
              <th>Expires</th>
              <th>Used at</th>
              <th>Created</th>
              <th className="col-actions" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '20px 0', color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>
                  Loading…
                </td>
              </tr>
            ) : invitations.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '20px 0', color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>
                  No invitations yet.
                </td>
              </tr>
            ) : invitations.map(inv => (
              <tr key={inv.id}>
                <td><span className="p-mono" style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{inv.id}</span></td>
                <td>{statusBadge(inv)}</td>
                <td style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{fmt(inv.expires_at)}</td>
                <td style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{inv.used_at ? fmt(inv.used_at) : '—'}</td>
                <td style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{fmt(inv.created_at)}</td>
                <td className="col-actions">
                  {!inv.used_at && new Date(inv.expires_at) >= new Date() && (
                    <button className="btn btn-ghost btn-sm" onClick={() => copyLink(inv.token, inv.id)}>
                      {copiedId === inv.id ? 'Copied!' : 'Copy link'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {newInvite && (
        <div className="p-overlay">
          <div className="p-dialog">
            <div className="dialog-header">
              <h3 className="dialog-title">Invitation link created</h3>
              <p className="dialog-desc">
                Share this link with the invitee. It expires on <strong>{fmt(newInvite.expires_at)}</strong> and can only be used once.
              </p>
            </div>
            <div className="dialog-body">
              <div>
                <label className="p-label">Invitation URL</label>
                <div className="input-group">
                  <input
                    className="p-input p-mono"
                    style={{ fontSize: 12 }}
                    readOnly
                    value={inviteUrl(newInvite.token)}
                    onFocus={e => e.target.select()}
                  />
                  <button className="ig-suffix" type="button" onClick={() => copyLink(newInvite.token, 'modal')}>
                    {copiedId === 'modal' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-default" type="button" onClick={() => { setNewInvite(null); setCopiedId(null) }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
