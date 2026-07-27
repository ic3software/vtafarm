import { useState, useEffect, useCallback } from 'react'
import { api, type User } from '@/lib/api'

const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: browserTz })
}

export function UsersView() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [recoveringId, setRecoveringId] = useState<string | null>(null)
  const [recovery, setRecovery] = useState<{ uniqueId: string; token: string; expires_at: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const loadUsers = useCallback(() => {
    setLoading(true)
    api.listUsers().then(setUsers).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  async function toggleBetaAccess(user: User) {
    setUpdatingId(user.unique_id)
    try {
      const next = !user.beta_access
      await api.setUserBetaAccess(user.unique_id, next)
      setUsers(prev => prev.map(u => u.unique_id === user.unique_id ? { ...u, beta_access: next } : u))
    } catch {
      // leave state unchanged — user can retry
    } finally {
      setUpdatingId(null)
    }
  }

  async function issueRecoveryLink(user: User) {
    setRecoveringId(user.unique_id)
    try {
      const result = await api.createRecoveryLink(user.unique_id)
      setRecovery({ uniqueId: user.unique_id, token: result.token, expires_at: result.expires_at })
      setCopied(false)
    } catch {
      // silently ignore — admin can retry
    } finally {
      setRecoveringId(null)
    }
  }

  async function copyRecoveryUrl(token: string) {
    await navigator.clipboard.writeText(`${window.location.origin}/recover/${token}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="p-content">
      <div className="page-head">
        <div>
          <h1>Users</h1>
          <p className="sub">People with access to the VTA Farm portal. Invite new users via the Invitations panel.</p>
        </div>
      </div>

      <div className="table-wrap">
        <table className="p-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Unique ID</th>
              <th>Email</th>
              <th>Beta Access</th>
              <th>Created</th>
              <th>Updated</th>
              <th className="col-actions" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '20px 0', color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>
                  Loading…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '20px 0', color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>
                  No users yet.
                </td>
              </tr>
            ) : users.map(u => (
              <tr key={u.id}>
                <td><span className="p-mono" style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{u.id}</span></td>
                <td><span className="p-mono" style={{ fontSize: 12 }}>{u.unique_id}</span></td>
                <td style={{ fontSize: 13 }}>
                  {u.system
                    ? <span className="p-badge badge-warning">System account</span>
                    : u.email ?? <span style={{ color: 'hsl(var(--muted-foreground))' }}>—</span>}
                </td>
                <td>
                  {/* The platform stack's owner is not a person: no passkey, no
                      email, and beta access is meaningless on it — so none of
                      the per-user controls apply. */}
                  {u.system ? (
                    <span style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>n/a</span>
                  ) : (
                    <div className="p-row gap-8" style={{ alignItems: 'center' }}>
                      <span className={`p-badge ${u.beta_access ? 'badge-success' : 'badge-secondary'}`}>
                        {u.beta_access ? 'Enabled' : 'Disabled'}
                      </span>
                      <button
                        className="btn btn-outline btn-sm"
                        disabled={updatingId === u.unique_id}
                        onClick={() => toggleBetaAccess(u)}
                      >
                        {updatingId === u.unique_id ? 'Saving…' : u.beta_access ? 'Revoke' : 'Grant'}
                      </button>
                    </div>
                  )}
                </td>
                <td style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{fmt(u.created_at)}</td>
                <td style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{fmt(u.updated_at)}</td>
                <td className="col-actions">
                  {!u.system && (
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={recoveringId === u.unique_id}
                      onClick={() => issueRecoveryLink(u)}
                      title="Issue a single-use login link for a user who lost their passkey"
                    >
                      {recoveringId === u.unique_id ? 'Issuing…' : 'Recovery link'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {recovery && (
        <div className="p-overlay">
          <div className="p-dialog">
            <div className="dialog-header">
              <h3 className="dialog-title">Recovery link created</h3>
              <p className="dialog-desc">
                Verify the requester is really the owner of account{' '}
                <span className="p-mono">{recovery.uniqueId}</span> before sharing this
                link — whoever opens it takes over the account. It expires on{' '}
                <strong>{fmt(recovery.expires_at)}</strong>, works once, and revokes
                all existing passkeys on the account when used.
              </p>
            </div>
            <div className="dialog-body">
              <div>
                <label className="p-label">Recovery URL</label>
                <div className="input-group">
                  <input
                    className="p-input p-mono"
                    style={{ fontSize: 12 }}
                    readOnly
                    value={`${window.location.origin}/recover/${recovery.token}`}
                    onFocus={e => e.target.select()}
                  />
                  <button className="ig-suffix" type="button" onClick={() => copyRecoveryUrl(recovery.token)}>
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-default" type="button" onClick={() => setRecovery(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
