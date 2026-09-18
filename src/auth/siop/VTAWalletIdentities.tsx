import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, type SIOPIdentity, type SIOPRole } from '@/lib/api'
import { isWalletCancellation, getWallet } from './wallet'
import { linkVTAWallet } from './login'

const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: browserTz })
}

export function VTAWalletIdentities({ role, hasPasskey }: { role: SIOPRole; hasPasskey: boolean }) {
  const [enabled, setEnabled] = useState(false)
  const [identities, setIdentities] = useState<SIOPIdentity[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [label, setLabel] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingID, setDeletingID] = useState<number | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(
    () => api.siopMetadata()
      .then(metadata => {
        setEnabled(metadata.enabled)
        return metadata.enabled ? api.listSIOPIdentities(role).then(setIdentities) : undefined
      })
      .catch(() => {
        // The passkey panel remains usable when optional SIOP metadata is down.
      })
      .finally(() => setLoading(false)),
    [role],
  )

  useEffect(() => { void load() }, [load])

  if (!loading && !enabled) return null

  async function handleAdd(event: FormEvent) {
    event.preventDefault()
    setAdding(true)
    setError('')
    try {
      const identity = await linkVTAWallet(role, label.trim() || 'VTA Wallet')
      setIdentities(previous => [...previous, identity])
      setLabel('')
      setShowAdd(false)
    } catch (linkError) {
      if (!isWalletCancellation(linkError)) {
        setError(linkError instanceof Error ? linkError.message : 'Could not link VTA Wallet identity.')
      }
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: number) {
    setDeletingID(id)
    setError('')
    try {
      await api.deleteSIOPIdentity(role, id)
      setIdentities(previous => previous.filter(identity => identity.id !== id))
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not unlink VTA Wallet identity.')
    } finally {
      setDeletingID(null)
    }
  }

  const walletAvailable = Boolean(getWallet())
  return (
    <>
      <div className="p-card" style={{ marginTop: 20 }}>
        <div className="card-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h3 className="card-title">VTA Wallet identities</h3>
            <p className="card-desc">Linked identities can sign in to this {role} account. Keep at least one passkey for recovery.</p>
          </div>
          {walletAvailable && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ flexShrink: 0, marginTop: 2 }}
              onClick={() => { setShowAdd(true); setError('') }}
              disabled={!hasPasskey}
              title={!hasPasskey ? 'Register a passkey before linking an identity' : undefined}
            >
              <span aria-hidden="true">+</span> Link
            </button>
          )}
        </div>
        <div className="card-content" style={{ padding: 0 }}>
          {loading ? (
            <p style={{ padding: '16px 20px', margin: 0, fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>Loading…</p>
          ) : identities.length === 0 ? (
            <p style={{ padding: '16px 20px', margin: 0, fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>
              {walletAvailable
                ? 'No VTA Wallet identities linked yet.'
                : 'Enable the VTA Wallet extension for this site and reload to link an identity.'}
            </p>
          ) : identities.map((identity, index) => (
            <div key={identity.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
              borderTop: index > 0 ? '1px solid hsl(var(--border))' : undefined,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{identity.label}</div>
                <div className="p-mono" style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', overflowWrap: 'anywhere' }}>{identity.did}</div>
                <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 3 }}>
                  Linked {fmt(identity.created_at)}
                  {identity.last_authenticated_at ? ` · Last used ${fmt(identity.last_authenticated_at)}` : ''}
                </div>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'hsl(var(--destructive))', flexShrink: 0 }}
                onClick={() => handleDelete(identity.id)}
                disabled={deletingID === identity.id}
              >
                {deletingID === identity.id ? 'Unlinking…' : 'Unlink'}
              </button>
            </div>
          ))}
        </div>
        {error && <p style={{ margin: '12px 20px 16px', fontSize: 13, color: 'hsl(var(--destructive))' }}>{error}</p>}
      </div>

      {showAdd && (
        <div className="p-overlay">
          <div className="p-dialog">
            <div className="dialog-header">
              <h3 className="dialog-title">Link a VTA Wallet identity</h3>
              <p className="dialog-desc">Your wallet will ask you to choose a persona and approve a one-time assertion for VTA Farm.</p>
            </div>
            <form onSubmit={handleAdd}>
              <div className="dialog-body">
                <div>
                  <label className="p-label">Label</label>
                  <input
                    className="p-input"
                    value={label}
                    onChange={event => setLabel(event.target.value)}
                    placeholder="Personal wallet"
                    maxLength={80}
                    autoFocus
                  />
                </div>
                {error && <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{error}</p>}
              </div>
              <div className="dialog-footer">
                <button className="btn btn-ghost" type="button" onClick={() => { setShowAdd(false); setError('') }}>Cancel</button>
                <button className="btn btn-default" type="submit" disabled={adding}>
                  {adding ? 'Waiting for VTA Wallet…' : 'Continue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
