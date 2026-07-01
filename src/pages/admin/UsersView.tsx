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
              <th>Beta Access</th>
              <th>Created</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '20px 0', color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>
                  Loading…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '20px 0', color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>
                  No users yet.
                </td>
              </tr>
            ) : users.map(u => (
              <tr key={u.id}>
                <td><span className="p-mono" style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{u.id}</span></td>
                <td><span className="p-mono" style={{ fontSize: 12 }}>{u.unique_id}</span></td>
                <td>
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
                </td>
                <td style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{fmt(u.created_at)}</td>
                <td style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{fmt(u.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
