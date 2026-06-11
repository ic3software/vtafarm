import { useState, useEffect, type FormEvent } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import '@/styles/portal.css'
import { api } from '@/lib/api'
import { useUserAuth } from '@/contexts/UserAuthContext'

export function Register() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { user } = useUserAuth()

  const [validating, setValidating] = useState(true)
  const [tokenError, setTokenError] = useState('')
  const [expiresAt, setExpiresAt] = useState('')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) { setTokenError('Invalid invitation link.'); setValidating(false); return }
    api.validateInvitation(token)
      .then(res => { setExpiresAt(res.expires_at) })
      .catch(err => {
        const status = (err as { status?: number }).status
        if (status === 410) setTokenError('This invitation has already been used or has expired.')
        else if (status === 404) setTokenError('Invitation not found.')
        else setTokenError('Unable to validate invitation link.')
      })
      .finally(() => setValidating(false))
  }, [token])

  if (user) return <Navigate to="/portal" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!token) return
    setSubmitError('')
    setSubmitting(true)
    try {
      await api.registerViaInvitation(token, email, password)
      setDone(true)
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status === 409) setSubmitError('An account with that email already exists.')
      else if (status === 410) setSubmitError('This invitation has already been used or has expired.')
      else setSubmitError(err instanceof Error ? err.message : 'Registration failed.')
    } finally {
      setSubmitting(false)
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
              <span>Cipher</span>
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
            ) : done ? (
              <>
                <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', margin: '0 0 8px' }}>
                  Account created
                </h1>
                <p className="p-muted" style={{ margin: '0 0 28px', fontSize: 14 }}>
                  Your account has been created. You can now sign in.
                </p>
                <button
                  className="btn btn-default btn-lg btn-block"
                  onClick={() => navigate('/login')}
                >
                  Sign in <span className="arrow">→</span>
                </button>
              </>
            ) : (
              <>
                <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', margin: '0 0 6px' }}>
                  Create your account
                </h1>
                <p className="p-muted" style={{ margin: '0 0 28px', fontSize: 14 }}>
                  You've been invited to join Cipher Portal.
                  {expiresAt && (
                    <> This link expires <strong>{fmtExpiry(expiresAt)}</strong>.</>
                  )}
                </p>

                <form onSubmit={handleSubmit} className="p-col gap-16">
                  <div>
                    <label className="p-label" htmlFor="reg-email">Email</label>
                    <div className="input-group">
                      <svg className="ig-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" />
                      </svg>
                      <input
                        className="p-input"
                        id="reg-email"
                        type="email"
                        placeholder="you@company.com"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>
                  </div>
                  <div>
                    <label className="p-label" htmlFor="reg-pass">Password</label>
                    <div className="input-group mt-8">
                      <svg className="ig-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      <input
                        className="p-input"
                        id="reg-pass"
                        type={showPass ? 'text' : 'password'}
                        placeholder="min. 8 characters"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        minLength={8}
                      />
                      <button className="ig-suffix" type="button" onClick={() => setShowPass(v => !v)}>
                        {showPass ? 'hide' : 'show'}
                      </button>
                    </div>
                  </div>

                  {submitError && (
                    <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{submitError}</p>
                  )}

                  <button className="btn btn-default btn-lg btn-block mt-8" type="submit" disabled={submitting}>
                    {submitting ? 'Creating account…' : 'Create account'}
                    {!submitting && <span className="arrow">→</span>}
                  </button>
                </form>

                <p className="p-muted text-xs mt-24" style={{ textAlign: 'center' }}>
                  Already have an account? <a href="/login" style={{ color: 'hsl(var(--primary))' }}>Sign in</a>
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
