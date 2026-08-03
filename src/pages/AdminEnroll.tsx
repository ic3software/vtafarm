import { useState, useEffect } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { startRegistration } from '@simplewebauthn/browser'
import '@/styles/portal.css'
import { api } from '@/lib/api'
import { useAdminAuth } from '@/contexts/adminAuth'

export function AdminEnroll() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { admin, setAdminSession } = useAdminAuth()

  // Derived from the URL rather than set in the effect below: a missing token
  // is knowable on the first render, and setting it there forced a second one.
  const [validating, setValidating] = useState(!!token)
  const [tokenError, setTokenError] = useState(token ? '' : 'Invalid enrollment link.')
  const [expiresAt, setExpiresAt] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    api.validateEnrollToken(token)
      .then(res => setExpiresAt(res.expires_at))
      .catch(err => {
        const status = (err as { status?: number }).status
        if (status === 410) setTokenError('This enrollment link has already been used or has expired.')
        else if (status === 404) setTokenError('Enrollment link not found.')
        else setTokenError('Unable to validate this enrollment link.')
      })
      .finally(() => setValidating(false))
  }, [token])

  if (admin) return <Navigate to="/admin" replace />

  async function handleEnroll() {
    if (!token) return
    setError('')
    setLoading(true)
    try {
      // enrollAdmin sets the vtafarm_admin cookie — don't update React state yet
      // or the `if (admin) return <Navigate>` guard will unmount this component
      // before passkey registration finishes.
      const enrolled = await api.enrollAdmin(token)

      const options = await api.adminPasskeyRegisterBegin()
      const credential = await startRegistration({ optionsJSON: options.publicKey as never })
      await api.adminPasskeyRegisterComplete('Admin Passkey', credential)

      // Only set session after passkey is saved on the server
      setAdminSession({ id: enrolled.id, unique_id: enrolled.unique_id, role: 'admin' })
      navigate('/admin')
    } catch (err) {
      if ((err as { name?: string }).name === 'NotAllowedError') {
        setError('Passkey registration was cancelled. Please try again.')
      } else {
        setError(err instanceof Error ? err.message : 'Enrollment failed.')
      }
    } finally {
      setLoading(false)
    }
  }

  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
  function fmtExpiry(iso: string) {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: browserTz })
  }

  return (
    <div className="portal-root">
      <div className="p-auth">
        {/* Aside */}
        <div className="auth-aside">
          <div className="grid-bg" />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <span className="p-badge badge-default" style={{ background: 'hsl(252 100% 65% / .2)', color: '#c6b8ff', borderColor: 'hsl(252 100% 75% / .3)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 13, height: 13 }}>
                <path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z" />
              </svg>
              Admin console
            </span>
          </div>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <p className="p-serif" style={{ fontSize: 36, lineHeight: 1.1, letterSpacing: '-.02em', margin: '0 0 16px' }}>
              The keys to the <em style={{ fontStyle: 'italic', color: '#c6b8ff' }}>trust layer.</em>
            </p>
            <p style={{ color: 'hsl(0 0% 100% / .65)', fontSize: 15, maxWidth: '42ch', margin: 0, lineHeight: 1.55 }}>
              Set up your admin passkey to gain access to the VTA Farm control plane.
            </p>
          </div>
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 28, color: 'hsl(0 0% 100% / .5)', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase' }}>
            <span>Role-scoped</span><span>Audit-logged</span><span>MFA enforced</span>
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

            {validating ? (
              <>
                <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', margin: '0 0 8px' }}>
                  Verifying link…
                </h1>
                <p className="p-muted" style={{ margin: 0, fontSize: 14 }}>Please wait.</p>
              </>
            ) : tokenError ? (
              <>
                <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', margin: '0 0 8px' }}>
                  Invalid enrollment link
                </h1>
                <p style={{ margin: '0 0 24px', fontSize: 14, color: 'hsl(var(--destructive))' }}>{tokenError}</p>
                <a href="/" className="btn btn-default btn-block" style={{ textDecoration: 'none', textAlign: 'center' }}>
                  Back to home
                </a>
              </>
            ) : (
              <>
                <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', margin: '0 0 6px' }}>
                  Set up your admin account
                </h1>
                <p className="p-muted" style={{ margin: '0 0 28px', fontSize: 14 }}>
                  You've been invited as an administrator.
                  {expiresAt && <> This link expires <strong>{fmtExpiry(expiresAt)}</strong>.</>}
                  {' '}Your device will prompt you to register a passkey.
                </p>

                <button
                  className="btn btn-default btn-lg btn-block"
                  type="button"
                  onClick={handleEnroll}
                  disabled={loading}
                  style={{ gap: 10 }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 18, height: 18, flexShrink: 0 }}>
                    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                  </svg>
                  {loading ? 'Setting up…' : 'Sign up with Passkey'}
                  {!loading && <span className="arrow">→</span>}
                </button>

                {error && (
                  <p style={{ margin: '12px 0 0', fontSize: 13, color: 'hsl(var(--destructive))' }}>{error}</p>
                )}

                <p className="p-muted text-xs mt-24" style={{ textAlign: 'center' }}>
                  MFA required · all actions are audit-logged
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
