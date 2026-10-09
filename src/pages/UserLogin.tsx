import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { startAuthentication } from '@simplewebauthn/browser'
import '@/styles/portal.css'
import { api } from '@/lib/api'
import { useUserAuth } from '@/contexts/userAuth'
import { WalletLoginOption } from '@/auth/siop/WalletLoginOption'

export function UserLogin() {
  const { user, setUserSession } = useUserAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (user) return <Navigate to="/portal" replace />

  async function handlePasskeyLogin() {
    setError('')
    setLoading(true)
    try {
      const { session_id, publicKey } = await api.userPasskeyLoginBegin()
      const assertion = await startAuthentication({ optionsJSON: publicKey as never })
      const data = await api.userPasskeyLoginComplete(session_id, assertion)
      setUserSession(data.user)
      navigate('/portal')
    } catch (err) {
      if ((err as { name?: string }).name === 'NotAllowedError') {
        // user cancelled — silent
      } else {
        setError(err instanceof Error ? err.message : 'Authentication failed.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="portal-root">
      <div className="p-auth">
        <div className="auth-panel">
          <div className="auth-card">
            <a href="/" className="auth-brand" style={{ textDecoration: 'none', color: 'inherit' }}>
              <span className="sidebar-mark" />
              <span>VTA Farm</span>
            </a>
            <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', margin: '0 0 6px' }}>
              Welcome back
            </h1>
            <p className="p-muted" style={{ margin: '0 0 32px', fontSize: 14 }}>
              Sign in with your passkey to manage your Trust Agent.
            </p>

            <button
              className="btn btn-default btn-lg btn-block"
              type="button"
              onClick={handlePasskeyLogin}
              disabled={loading}
              style={{ gap: 10 }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 18, height: 18, flexShrink: 0 }}>
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>
              </svg>
              {loading ? 'Waiting for device…' : 'Sign in with Passkey'}
              {!loading && <span className="arrow">→</span>}
            </button>

            {error && (
              <p style={{ margin: '12px 0 0', fontSize: 13, color: 'hsl(var(--destructive))' }}>{error}</p>
            )}

            <WalletLoginOption
              role="user"
              disabled={loading}
              onSuccess={walletUser => {
                setUserSession(walletUser)
                navigate('/portal')
              }}
            />

            <p className="p-muted text-xs mt-24" style={{ textAlign: 'center' }}>
              Protected by passkey or a linked identity in the browser plugin.
            </p>
          </div>
        </div>

        {/* Only one block left in the aside, so center it: the shared
            `space-between` rule is written for the three-block version the
            other auth screens still use. */}
        <div className="auth-aside" style={{ justifyContent: 'center' }}>
          <div className="grid-bg" />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <p className="p-serif" style={{ fontSize: 36, lineHeight: 1.1, letterSpacing: '-.02em', margin: '0 0 16px' }}>
              Create and manage your <em style={{ fontStyle: 'italic', color: '#f4c7c8' }}>Trust Agent.</em>
            </p>
            <p style={{ color: 'hsl(0 0% 100% / .65)', fontSize: 15, maxWidth: '42ch', margin: 0, lineHeight: 1.55 }}>
              Provision a Trust Agent in a couple of minutes and link it to your Keyring wallet or personal network manager.
            </p>
            {/* Sets expectations before anyone invests in an agent here: the
                hostnames and DIDs an agent mints are permanent, so "this may
                go away" has to be said before sign-up, not after. */}
            <div style={{ marginTop: 28, maxWidth: '42ch', padding: '14px 16px', borderRadius: 'var(--radius)', border: '1px solid hsl(359 67% 65% / .28)', background: 'hsl(359 67% 56% / .12)' }}>
              <p style={{ color: 'hsl(0 0% 100% / .9)', fontSize: 19, fontWeight: 600, margin: '0 0 8px' }}>
                This is a demo site
              </p>
              <p style={{ color: 'hsl(0 0% 100% / .6)', fontSize: 13, lineHeight: 1.55, margin: 0 }}>
                It may be torn down at a future date, and it may stop accepting
                new agents once it runs out of space. To run your own instance,
                the deployment code lives in{' '}
                <a href="https://github.com/ic3software/vtafarm-k8s" target="_blank" rel="noreferrer noopener"
                  style={{ color: '#f4c7c8', textDecoration: 'underline' }}>
                  vtafarm-k8s
                </a>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
