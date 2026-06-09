import { useState, type FormEvent } from 'react'
import { useOutletContext } from 'react-router-dom'
import { api } from '@/lib/api'
import { initials } from '../portal/portalUtils'
import type { AdminContext } from './AdminPanel'

export function UsersView() {
  const { email } = useOutletContext<AdminContext>()
  const [showCreate, setShowCreate] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [password, setPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createSuccess, setCreateSuccess] = useState('')

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault()
    setCreateError(''); setCreateSuccess(''); setCreating(true)
    try {
      const user = await api.createUser(newEmail, password)
      setCreateSuccess(`User ${user.email} created (ID: ${user.id})`)
      setNewEmail(''); setPassword('')
      setShowCreate(false)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setCreating(false)
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

      {createSuccess && (
        <div className="p-alert alert-success" style={{ marginBottom: 20 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z"/><path d="m9 12 2 2 4-4"/></svg>
          <p className="alert-desc">{createSuccess}</p>
        </div>
      )}

      <div className="table-wrap">
        <table className="p-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th className="col-actions"/>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div className="p-row">
                  <span className="p-avatar" style={{ width: 30, height: 30, fontSize: 11, background: 'hsl(var(--primary))', color: '#fff' }}>
                    {initials(email)}
                  </span>
                  <div className="p-col">
                    <span className="fw-600">{email} <span className="admin-pill" style={{ marginLeft: 4 }}>you</span></span>
                    <span className="text-xs p-muted">Admin account</span>
                  </div>
                </div>
              </td>
              <td><span className="p-badge badge-default">admin</span></td>
              <td><span className="p-badge badge-success"><span className="dot"/>active</span></td>
              <td className="col-actions"/>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="p-alert" style={{ marginTop: 16, background: 'hsl(var(--muted)/.4)' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: 'hsl(var(--muted-foreground))' }}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        <p className="alert-desc">User list is not available via the API yet. Create users with the button above; they can then sign in via <span className="p-mono">/login</span>.</p>
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
                  <input className="p-input" type="password" placeholder="min. 8 characters" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
                </div>
                {createError && <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{createError}</p>}
              </div>
              <div className="dialog-footer">
                <button className="btn btn-ghost" type="button" onClick={() => { setShowCreate(false); setCreateError('') }}>Cancel</button>
                <button className="btn btn-default" type="submit" disabled={creating}>
                  {creating ? 'Creating…' : 'Create user'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
