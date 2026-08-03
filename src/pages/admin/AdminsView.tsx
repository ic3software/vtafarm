import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { api, type AdminRecord } from '@/lib/api'
import type { AdminContext } from './AdminPanel'

const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: browserTz })
}

function enrollUrl(token: string) {
  return `${window.location.origin}/admin/enroll/${token}`
}

export function AdminsView() {
  const { uniqueId: selfUniqueId } = useOutletContext<AdminContext>()
  const [admins, setAdmins] = useState<AdminRecord[]>([])
  const [loading, setLoading] = useState(true)

  const [generating, setGenerating] = useState(false)
  const [newToken, setNewToken] = useState<{ token: string; expires: string } | null>(null)
  const [copiedToken, setCopiedToken] = useState(false)
  const [genError, setGenError] = useState('')

  // See UsersView: `loading` starts true, so the mount path needs no toggle,
  // and a synchronous one inside the effect is what the lint rule flags.
  const loadAdmins = useCallback(
    () => api.listAdmins().then(setAdmins).catch(() => {}).finally(() => setLoading(false)),
    [],
  )

  useEffect(() => { void loadAdmins() }, [loadAdmins])

  async function handleGenerateToken() {
    setGenError('')
    setGenerating(true)
    try {
      const result = await api.createAdminEnrollmentToken()
      setNewToken({ token: result.enrollment_token, expires: result.enrollment_expires })
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Failed to generate enrollment link')
    } finally {
      setGenerating(false)
    }
  }

  async function copyEnrollUrl(token: string) {
    await navigator.clipboard.writeText(enrollUrl(token))
    setCopiedToken(true)
    setTimeout(() => setCopiedToken(false), 2000)
  }

  return (
    <section className="p-content">
      <div className="page-head">
        <div>
          <h1>Administrators</h1>
          <p className="sub">Accounts with admin access to the control plane.</p>
        </div>
        <button className="btn btn-default" onClick={handleGenerateToken} disabled={generating}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          {generating ? 'Generating…' : 'Generate enrollment link'}
        </button>
      </div>

      {genError && (
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'hsl(var(--destructive))' }}>{genError}</p>
      )}

      <div className="table-wrap">
        <table className="p-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Unique ID</th>
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
            ) : admins.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '20px 0', color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>
                  No administrators yet.
                </td>
              </tr>
            ) : admins.map(a => (
              <tr key={a.id}>
                <td><span className="p-mono" style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{a.id}</span></td>
                <td>
                  <span className="p-mono" style={{ fontSize: 12 }}>{a.unique_id}</span>
                  {a.unique_id === selfUniqueId && <span className="admin-pill" style={{ marginLeft: 6 }}>you</span>}
                </td>
                <td style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{fmt(a.created_at)}</td>
                <td style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{fmt(a.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {newToken && (
        <div className="p-overlay">
          <div className="p-dialog">
            <div className="dialog-header">
              <h3 className="dialog-title">Enrollment link created</h3>
              <p className="dialog-desc">
                Share this link with the new admin. It expires on <strong>{fmt(newToken.expires)}</strong> and can only be used once.
              </p>
            </div>
            <div className="dialog-body">
              <div>
                <label className="p-label">Enrollment URL</label>
                <div className="input-group">
                  <input
                    className="p-input p-mono"
                    style={{ fontSize: 12 }}
                    readOnly
                    value={enrollUrl(newToken.token)}
                    onFocus={e => e.target.select()}
                  />
                  <button className="ig-suffix" type="button" onClick={() => copyEnrollUrl(newToken.token)}>
                    {copiedToken ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-default" type="button" onClick={() => { setNewToken(null); setCopiedToken(false) }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
