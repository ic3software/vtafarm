import { useState, useEffect } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { startRegistration } from '@simplewebauthn/browser'
import '@/styles/portal.css'
import { api } from '@/lib/api'
import { useUserAuth } from '@/contexts/UserAuthContext'

export function Register() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { user, setUserSession } = useUserAuth()

  const [validating, setValidating] = useState(true)
  const [tokenError, setTokenError] = useState('')
  const [expiresAt, setExpiresAt] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) { setTokenError('Invalid invitation link.'); setValidating(false); return }
    api.validateInvitation(token)
      .then(res => setExpiresAt(res.expires_at))
      .catch(err => {
        const status = (err as { status?: number }).status
        if (status === 410) setTokenError('This invitation has already been used or has expired.')
        else if (status === 404) setTokenError('Invitation not found.')
        else setTokenError('Unable to validate this invitation link.')
      })
      .finally(() => setValidating(false))
  }, [token])

  if (user) return <Navigate to="/portal" replace />

  async function handleRegister() {
    if (!token) return
    setError('')
    setLoading(true)
    try {
      // registerViaInvitation sets the vtafarm_user cookie — don't update React state yet
      // or the `if (user) return <Navigate>` guard will unmount this component
      // before passkey registration finishes.
      const registered = await api.registerViaInvitation(token)

      const options = await api.passkeyRegisterBegin()
      const credential = await startRegistration({ optionsJSON: options.publicKey as never })
      await api.passkeyRegisterComplete('My Passkey', credential)

      // Only set session after passkey is saved on the server
      setUserSession({ id: registered.id, unique_id: registered.unique_id, role: 'user' })
      navigate('/portal')
    } catch (err) {
      if ((err as { name?: string }).name === 'NotAllowedError') {
        setError('Passkey registration was cancelled. Please try again.')
      } else if ((err as { status?: number }).status === 410) {
        setTokenError('This invitation has already been used or has expired.')
      } else {
        setError(err instanceof Error ? err.message : 'Registration failed.')
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
        <div className="auth-panel">
          <div className="auth-card">
            <a href="/" className="auth-brand" style={{ textDecoration: 'none', color: 'inherit' }}>
              <span className="sidebar-mark" />
              <span>VTA Farm</span>
            </a>

            {validating ? (
              <>
                <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', margin: '0 0 8px' }}>
                  Verifying invitation…
                </h1>
                <p className="p-muted" style={{ margin: 0, fontSize: 14 }}>Please wait.</p>
              </>
            ) : tokenError ? (
              <>
                <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', margin: '0 0 8px' }}>
                  Invalid invitation
                </h1>
                <p style={{ margin: '0 0 24px', fontSize: 14, color: 'hsl(var(--destructive))' }}>{tokenError}</p>
                <a href="/" className="btn btn-default btn-block" style={{ textDecoration: 'none', textAlign: 'center' }}>
                  Back to home
                </a>
              </>
            ) : (
              <>
                <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', margin: '0 0 6px' }}>
                  Create your account
                </h1>
                <p className="p-muted" style={{ margin: '0 0 28px', fontSize: 14 }}>
                  You've been invited to join VTA Farm.
                  {expiresAt && <> This link expires <strong>{fmtExpiry(expiresAt)}</strong>.</>}
                  {' '}Your device will prompt you to register a passkey.
                </p>

                <button
                  className="btn btn-default btn-lg btn-block"
                  type="button"
                  onClick={handleRegister}
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
                  Already have an account?{' '}
                  <a href="/login" style={{ color: 'hsl(var(--primary))' }}>Sign in</a>
                </p>
              </>
            )}
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
