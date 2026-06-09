import { useState, type FormEvent } from 'react'
import { useOutletContext } from 'react-router-dom'
import { api } from '@/lib/api'
import { initials } from '../portal/portalUtils'
import type { AdminContext } from './AdminPanel'

export function SecurityView() {
  const { email } = useOutletContext<AdminContext>()
  const [current, setCurrent] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (newPw !== confirm) { setErr('Passwords do not match'); return }
    setSaving(true); setErr(''); setMsg('')
    try {
      await api.changeAdminPassword(current, newPw)
      setMsg('Password updated. Sign in again on other sessions.')
      setCurrent(''); setNewPw(''); setConfirm('')
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to update password')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="p-content" style={{ maxWidth: 680 }}>
      <div className="page-head"><div><h1>Security</h1><p className="sub">Manage your operator credentials.</p></div></div>

      <div className="p-card" style={{ marginBottom: 20 }}>
        <div className="card-header"><h3 className="card-title">Profile</h3></div>
        <div className="card-content p-row gap-16 center">
          <span className="p-avatar" style={{ width: 52, height: 52, fontSize: 18, background: 'hsl(var(--primary))', color: '#fff' }}>
            {initials(email)}
          </span>
          <div className="p-col">
            <span className="fw-600">{email}</span>
            <span className="p-muted text-sm">Admin account</span>
          </div>
        </div>
      </div>

      <div className="p-card">
        <div className="card-header"><h3 className="card-title">Change your password</h3><p className="card-desc">Operator passwords must be at least 8 characters.</p></div>
        <form onSubmit={handleSubmit}>
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
            <div className="p-alert alert-info">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
              <p className="alert-desc">Changing your password signs out all other operator sessions.</p>
            </div>
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
