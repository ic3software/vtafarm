import { useEffect, useState } from 'react'
import type { SIOPRole, UserInfo } from '@/lib/api'
import { isWalletCancellation } from './wallet'
import { loadSIOPCapability, loginWithVTAWallet } from './login'

export function WalletLoginOption({
  role,
  disabled,
  onSuccess,
}: {
  role: SIOPRole
  disabled: boolean
  onSuccess: (user: UserInfo) => void
}) {
  const [enabled, setEnabled] = useState(false)
  const [walletAvailable, setWalletAvailable] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void loadSIOPCapability()
      .then(({ metadata, walletAvailable: available }) => {
        setEnabled(metadata.enabled)
        setWalletAvailable(available)
      })
      .catch(() => {})
  }, [])

  if (!enabled) return null

  async function handleLogin() {
    setError('')
    setLoading(true)
    try {
      onSuccess(await loginWithVTAWallet(role))
    } catch (loginError) {
      if (!isWalletCancellation(loginError)) {
        setError(loginError instanceof Error ? loginError.message : 'VTA Wallet authentication failed.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0', color: 'hsl(var(--muted-foreground))', fontSize: 12 }}>
        <span style={{ height: 1, flex: 1, background: 'hsl(var(--border))' }} />
        or
        <span style={{ height: 1, flex: 1, background: 'hsl(var(--border))' }} />
      </div>
      {walletAvailable ? (
        <>
          <button
            className="btn btn-outline btn-lg btn-block"
            type="button"
            onClick={handleLogin}
            disabled={disabled || loading}
            style={{ gap: 10 }}
          >
            <span aria-hidden="true" style={{ fontSize: 18 }}>◈</span>
            {loading ? 'Waiting for the plugin…' : 'Continue with VTA Browser Plugin'}
            {!loading && <span className="arrow">→</span>}
          </button>
          <p className="p-muted" style={{ margin: '8px 0 0', fontSize: 12, textAlign: 'center' }}>
            For identities already linked from {role === 'admin' ? 'Security' : 'Settings'} after passkey sign-in.
          </p>
        </>
      ) : (
        <p className="p-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5, textAlign: 'center' }}>
          Enable the{' '}
          {/* `.portal-root a` resets color and underline, so a link in here
              is indistinguishable from the surrounding text without this. */}
          <a href="https://github.com/OpenVTC/vta-browser-plugin" target="_blank" rel="noreferrer noopener"
            style={{ color: 'hsl(var(--primary))', textDecoration: 'underline' }}>
            VTA Browser Plugin
          </a>{' '}
          for this site, then reload to sign in using the plugin.
        </p>
      )}
      {error && (
        <p style={{ margin: '12px 0 0', fontSize: 13, color: 'hsl(var(--destructive))' }}>{error}</p>
      )}
    </>
  )
}
