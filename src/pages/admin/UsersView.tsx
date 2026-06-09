import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { api, type User } from '@/lib/api'

const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: browserTz })
}

export function UsersView() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  const [showCreate, setShowCreate] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const [resetPw, setResetPw] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState('')

  const loadUsers = useCallback(() => {
    setLoading(true)
    api.listUsers().then(setUsers).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault()
    setCreateError(''); setCreating(true)
    try {
      await api.createUser(newEmail, newPassword)
      setNewEmail(''); setNewPassword('')
      setShowCreate(false)
      loadUsers()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setCreating(false)
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault()
    if (!resetTarget) return
    setResetError(''); setResetting(true)
    try {
      await api.resetUserPassword(resetTarget.id, resetPw)
      setResetTarget(null); setResetPw('')
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Failed to reset password')
    } finally {
      setResetting(false)
    }
  }

  return (
    <section className="p-content">
      <div className="page-head">
        <div>
          <h1>Users</h1>
          <p className="sub">People with access to the Cipher portal.</p>
        </div>
        <button className="btn btn-default" onClick={() => setShowCreate(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>
          Create user
        </button>
      </div>

      <div className="table-wrap">
        <table className="p-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>User ID</th>
              <th>Email</th>
              <th>Created</th>
              <th>Updated</th>
              <th className="col-actions"/>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '20px 0', color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>
                  Loading…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '20px 0', color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>
                  No users yet.
                </td>
              </tr>
            ) : users.map(u => (
              <tr key={u.id}>
                <td><span className="p-mono" style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{u.id}</span></td>
                <td><span className="p-mono" style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{u.unique_id}</span></td>
                <td>{u.email}</td>
                <td style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{fmt(u.created_at)}</td>
                <td style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{fmt(u.updated_at)}</td>
                <td className="col-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => { setResetTarget(u); setResetPw(''); setResetError('') }}>
                    Reset password
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="p-overlay">
          <div className="p-dialog">
            <div className="dialog-header">
              <h3 className="dialog-title">Create a user</h3>
              <p className="dialog-desc">The user can sign in at <span className="p-mono">/login</span> with these credentials.</p>
            </div>
            <form onSubmit={handleCreateUser}>
              <div className="dialog-body">
                <div>
                  <label className="p-label">Email <span className="req">*</span></label>
                  <div className="input-group">
                    <svg className="ig-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
                    <input className="p-input" type="email" placeholder="user@example.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} required autoFocus />
                  </div>
                </div>
                <div>
                  <label className="p-label">Password <span className="req">*</span></label>
                  <input className="p-input" type="password" placeholder="min. 8 characters" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={8} />
                </div>
                {createError && <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{createError}</p>}
              </div>
              <div className="dialog-footer">
                <button className="btn btn-ghost" type="button" onClick={() => { setShowCreate(false); setCreateError('') }}>Cancel</button>
                <button className="btn btn-default" type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create user'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetTarget && (
        <div className="p-overlay">
          <div className="p-dialog">
            <div className="dialog-header">
              <h3 className="dialog-title">Reset password</h3>
              <p className="dialog-desc">Set a new password for <span className="fw-600">{resetTarget.email}</span>.</p>
            </div>
            <form onSubmit={handleResetPassword}>
              <div className="dialog-body">
                <div>
                  <label className="p-label">New password <span className="req">*</span></label>
                  <input className="p-input" type="password" placeholder="min. 8 characters" value={resetPw} onChange={e => setResetPw(e.target.value)} required minLength={8} autoFocus />
                </div>
                {resetError && <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{resetError}</p>}
              </div>
              <div className="dialog-footer">
                <button className="btn btn-ghost" type="button" onClick={() => { setResetTarget(null); setResetError('') }}>Cancel</button>
                <button className="btn btn-default" type="submit" disabled={resetting}>{resetting ? 'Saving…' : 'Save password'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
