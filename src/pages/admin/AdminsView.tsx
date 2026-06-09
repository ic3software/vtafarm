import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { useOutletContext } from 'react-router-dom'
import { api, type AdminRecord } from '@/lib/api'
import type { AdminContext } from './AdminPanel'

const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: browserTz })
}

export function AdminsView() {
  const { email: selfEmail } = useOutletContext<AdminContext>()
  const [admins, setAdmins] = useState<AdminRecord[]>([])
  const [loading, setLoading] = useState(true)

  const [showCreate, setShowCreate] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const loadAdmins = useCallback(() => {
    setLoading(true)
    api.listAdmins().then(setAdmins).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadAdmins() }, [loadAdmins])

  async function handleCreateAdmin(e: FormEvent) {
    e.preventDefault()
    setCreateError(''); setCreating(true)
    try {
      await api.createAdmin(newEmail, newPassword)
      setNewEmail(''); setNewPassword('')
      setShowCreate(false)
      loadAdmins()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create admin')
    } finally {
      setCreating(false)
    }
  }

  return (
    <section className="p-content">
      <div className="page-head">
        <div>
          <h1>Administrators</h1>
          <p className="sub">Accounts with admin access to the control plane.</p>
        </div>
        <button className="btn btn-default" onClick={() => setShowCreate(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>
          Create admin
        </button>
      </div>

      <div className="table-wrap">
        <table className="p-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Email</th>
              <th>Created</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '20px 0', color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>
                  Loading…
                </td>
              </tr>
            ) : admins.map(a => (
              <tr key={a.id}>
                <td><span className="p-mono" style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{a.id}</span></td>
                <td>
                  {a.email}
                  {a.email === selfEmail && <span className="admin-pill" style={{ marginLeft: 6 }}>you</span>}
                </td>
                <td style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{fmt(a.created_at)}</td>
                <td style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{fmt(a.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="p-overlay">
          <div className="p-dialog">
            <div className="dialog-header">
              <h3 className="dialog-title">Create an admin</h3>
              <p className="dialog-desc">The new admin can sign in at <span className="p-mono">/admin/login</span>.</p>
            </div>
            <form onSubmit={handleCreateAdmin}>
              <div className="dialog-body">
                <div>
                  <label className="p-label">Email <span className="req">*</span></label>
                  <div className="input-group">
                    <svg className="ig-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
                    <input className="p-input" type="email" placeholder="admin@example.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} required autoFocus />
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
                <button className="btn btn-default" type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create admin'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
