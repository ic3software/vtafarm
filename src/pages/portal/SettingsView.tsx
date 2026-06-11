import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { useOutletContext } from 'react-router-dom'
import { startRegistration } from '@simplewebauthn/browser'
import { api, type PasskeyRecord } from '@/lib/api'
import { initials } from './portalUtils'
import type { PortalContext } from './Portal'

const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: browserTz })
}

export function SettingsView() {
  const { uniqueId } = useOutletContext<PortalContext>()

  const [passkeys, setPasskeys] = useState<PasskeyRecord[]>([])
  const [loadingPasskeys, setLoadingPasskeys] = useState(true)
  const [showAddPasskey, setShowAddPasskey] = useState(false)
  const [newPasskeyName, setNewPasskeyName] = useState('')
  const [addingPasskey, setAddingPasskey] = useState(false)
  const [addPasskeyError, setAddPasskeyError] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const loadPasskeys = useCallback(() => {
    setLoadingPasskeys(true)
    api.listPasskeys().then(setPasskeys).catch(() => {}).finally(() => setLoadingPasskeys(false))
  }, [])

  useEffect(() => { loadPasskeys() }, [loadPasskeys])

  async function handleAddPasskey(e: FormEvent) {
    e.preventDefault()
    setAddPasskeyError('')
    setAddingPasskey(true)
    try {
      const options = await api.passkeyRegisterBegin()
      const credential = await startRegistration({ optionsJSON: options.publicKey as never })
      await api.passkeyRegisterComplete(newPasskeyName.trim() || 'Passkey', credential)
      setShowAddPasskey(false)
      setNewPasskeyName('')
      loadPasskeys()
    } catch (err) {
      if ((err as { name?: string }).name === 'NotAllowedError') {
        setAddPasskeyError('Registration was cancelled.')
      } else {
        setAddPasskeyError(err instanceof Error ? err.message : 'Failed to register passkey')
      }
    } finally {
      setAddingPasskey(false)
    }
  }

  async function handleDeletePasskey(id: number) {
    setDeletingId(id)
    try {
      await api.deletePasskey(id)
      setPasskeys(prev => prev.filter(p => p.id !== id))
    } catch {
      // silently fail — list will refresh on next load
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="p-content" style={{ maxWidth: 680 }}>
      <div className="page-head">
        <div><h1>Settings</h1><p className="sub">Manage your account and security.</p></div>
      </div>

      {/* Profile */}
      <div className="p-card" style={{ marginBottom: 20 }}>
        <div className="card-header"><h3 className="card-title">Profile</h3></div>
        <div className="card-content p-col gap-16">
          <div className="p-row gap-16 center">
            <span className="p-avatar" style={{ width: 52, height: 52, fontSize: 18 }}>{initials(uniqueId)}</span>
            <div className="p-col">
              <span className="fw-600 p-mono" style={{ fontSize: 13 }}>{uniqueId}</span>
              <span className="p-muted text-sm">User account</span>
            </div>
          </div>
        </div>
      </div>

      {/* Passkeys */}
      <div className="p-card">
        <div className="card-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h3 className="card-title">Passkeys</h3>
            <p className="card-desc">Sign in with Face ID, Touch ID, or a hardware key.</p>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0, marginTop: 2 }} onClick={() => { setShowAddPasskey(true); setAddPasskeyError('') }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 14, height: 14 }}><path d="M5 12h14M12 5v14"/></svg>
            Add
          </button>
        </div>
        <div className="card-content" style={{ padding: 0 }}>
          {loadingPasskeys ? (
            <p style={{ padding: '16px 20px', margin: 0, fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>Loading…</p>
          ) : passkeys.length === 0 ? (
            <p style={{ padding: '16px 20px', margin: 0, fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>No passkeys registered yet.</p>
          ) : passkeys.map((pk, i) => (
            <div key={pk.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
              borderTop: i > 0 ? '1px solid hsl(var(--border))' : undefined,
            }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: 'hsl(var(--muted))', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 16, height: 16, color: 'hsl(var(--muted-foreground))' }}>
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{pk.name}</div>
                <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                  Added {fmt(pk.created_at)}
                  {pk.last_used_at ? ` · Last used ${fmt(pk.last_used_at)}` : ' · Never used'}
                </div>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'hsl(var(--destructive))', flexShrink: 0 }}
                onClick={() => handleDeletePasskey(pk.id)}
                disabled={deletingId === pk.id || passkeys.length === 1}
                title={passkeys.length === 1 ? 'Cannot remove your only passkey' : undefined}
              >
                {deletingId === pk.id ? 'Removing…' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Add Passkey dialog */}
      {showAddPasskey && (
        <div className="p-overlay">
          <div className="p-dialog">
            <div className="dialog-header">
              <h3 className="dialog-title">Add a passkey</h3>
              <p className="dialog-desc">Give this passkey a name so you can identify it later (e.g. "MacBook Touch ID").</p>
            </div>
            <form onSubmit={handleAddPasskey}>
              <div className="dialog-body">
                <div>
                  <label className="p-label">Passkey name</label>
                  <input
                    className="p-input"
                    type="text"
                    placeholder="MacBook Touch ID"
                    value={newPasskeyName}
                    onChange={e => setNewPasskeyName(e.target.value)}
                    maxLength={64}
                    autoFocus
                  />
                </div>
                {addPasskeyError && (
                  <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{addPasskeyError}</p>
                )}
              </div>
              <div className="dialog-footer">
                <button className="btn btn-ghost" type="button" onClick={() => { setShowAddPasskey(false); setAddPasskeyError('') }}>Cancel</button>
                <button className="btn btn-default" type="submit" disabled={addingPasskey}>
                  {addingPasskey ? 'Waiting for device…' : 'Continue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
