import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { startAuthentication } from '@simplewebauthn/browser'
import '@/styles/portal.css'
import { api } from '@/lib/api'
import { useUserAuth } from '@/contexts/UserAuthContext'

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
              <span>Cipher</span>
            </a>
            <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', margin: '0 0 6px' }}>
              Welcome back
            </h1>
            <p className="p-muted" style={{ margin: '0 0 32px', fontSize: 14 }}>
              Sign in with your passkey to manage your Verifiable Trust Agents.
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

            <p className="p-muted text-xs mt-24" style={{ textAlign: 'center' }}>
              Protected by Cipher · <span className="p-mono">did:cipher:network</span>
            </p>
          </div>
        </div>

        <div className="auth-aside">
          <div className="grid-bg" />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <span className="p-badge badge-default" style={{ background: 'hsl(252 100% 65% / .2)', color: '#c6b8ff', borderColor: 'hsl(252 100% 75% / .3)' }}>
              <span className="dot pulse-dot" />Portal v1.0
            </span>
          </div>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <p className="p-serif" style={{ fontSize: 36, lineHeight: 1.1, letterSpacing: '-.02em', margin: '0 0 16px' }}>
              Identity that <em style={{ fontStyle: 'italic', color: '#c6b8ff' }}>proves itself.</em>
            </p>
            <p style={{ color: 'hsl(0 0% 100% / .65)', fontSize: 15, maxWidth: '42ch', margin: 0, lineHeight: 1.55 }}>
              Provision a Verifiable Trust Agent, mint a DID, and issue credentials — all from one quiet console.
            </p>
          </div>
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 28, color: 'hsl(0 0% 100% / .5)', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase' }}>
            <span>256-bit keys</span><span>W3C DID</span><span>Zero leakage</span>
          </div>
        </div>
      </div>
    </div>
  )
}
