import { useState, type FormEvent } from 'react'
import { useOutletContext } from 'react-router-dom'
import { api } from '@/lib/api'
import { initials } from './portalUtils'
import type { PortalContext } from './Portal'

export function SettingsView() {
  const { email } = useOutletContext<PortalContext>()
  const [current, setCurrent] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function handlePasswordChange(e: FormEvent) {
    e.preventDefault()
    if (newPw !== confirm) { setErr('Passwords do not match'); return }
    setSaving(true); setErr(''); setMsg('')
    try {
      await api.changeUserPassword(current, newPw)
      setMsg('Password updated successfully.')
      setCurrent(''); setNewPw(''); setConfirm('')
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to update password')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="p-content" style={{ maxWidth: 680 }}>
      <div className="page-head">
        <div><h1>Settings</h1><p className="sub">Manage your account and security.</p></div>
      </div>

      <div className="p-card" style={{ marginBottom: 20 }}>
        <div className="card-header"><h3 className="card-title">Profile</h3></div>
        <div className="card-content p-col gap-16">
          <div className="p-row gap-16 center">
            <span className="p-avatar" style={{ width: 52, height: 52, fontSize: 18 }}>{initials(email)}</span>
            <div className="p-col">
              <span className="fw-600">{email}</span>
              <span className="p-muted text-sm">User account</span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-card">
        <div className="card-header"><h3 className="card-title">Change password</h3><p className="card-desc">Use at least 8 characters.</p></div>
        <form onSubmit={handlePasswordChange}>
          <div className="card-content p-col gap-16">
            <div>
              <label className="p-label">Current password</label>
              <div className="input-group">
                <input className="p-input" type="password" value={current} onChange={e => setCurrent(e.target.value)} required />
              </div>
            </div>
            <div className="p-grid-2">
              <div><label className="p-label">New password</label><input className="p-input" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required minLength={8} /></div>
              <div><label className="p-label">Confirm new password</label><input className="p-input" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required /></div>
            </div>
            {err && <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{err}</p>}
            {msg && <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--success))' }}>{msg}</p>}
          </div>
          <div className="card-footer" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-default" type="submit" disabled={saving}>
              {saving ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
