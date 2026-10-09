import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { startAuthentication } from '@simplewebauthn/browser'
import '@/styles/portal.css'
import { api } from '@/lib/api'
import { useAdminAuth } from '@/contexts/adminAuth'
import { WalletLoginOption } from '@/auth/siop/WalletLoginOption'

export function AdminLogin() {
  const { admin, setAdminSession } = useAdminAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (admin) return <Navigate to="/admin" replace />

  async function handlePasskeyLogin() {
    setError('')
    setLoading(true)
    try {
      const { session_id, publicKey } = await api.adminPasskeyLoginBegin()
      const assertion = await startAuthentication({ optionsJSON: publicKey as never })
      const data = await api.adminPasskeyLoginComplete(session_id, assertion)
      setAdminSession(data.user)
      navigate('/admin')
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
        {/* Aside */}
        {/* Only one block left in the aside, so center it: the shared
            `space-between` rule is written for the three-block version the
            other auth screens still use. */}
        <div className="auth-aside" style={{ justifyContent: 'center' }}>
          <div className="grid-bg" />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <p className="p-serif" style={{ fontSize: 36, lineHeight: 1.1, letterSpacing: '-.02em', margin: '0 0 16px' }}>
              Create and manage your <em style={{ fontStyle: 'italic', color: '#f4c7c8' }}>Verifiable Trust Community</em>
            </p>
            <p style={{ color: 'hsl(0 0% 100% / .65)', fontSize: 15, maxWidth: '42ch', margin: 0, lineHeight: 1.55 }}>
              Provision your VTC and manage your community members&rsquo; Trust Agents
            </p>
          </div>
        </div>

        {/* Form panel */}
        <div className="auth-panel">
          <div className="auth-card">
            <a href="/" className="auth-brand" style={{ textDecoration: 'none', color: 'inherit' }}>
              <span className="sidebar-mark" />
              <span>VTA Farm</span>
              <span className="admin-pill">Admin</span>
            </a>
            <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', margin: '0 0 6px' }}>
              Operator sign-in
            </h1>
            <p className="p-muted" style={{ margin: '0 0 32px', fontSize: 14 }}>
              Administrative access to the VTA Farm control plane.
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
              role="admin"
              disabled={loading}
              onSuccess={walletAdmin => {
                setAdminSession(walletAdmin)
                navigate('/admin')
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
