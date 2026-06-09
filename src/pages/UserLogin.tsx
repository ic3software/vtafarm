import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import '@/styles/portal.css'
import { useUserAuth } from '@/contexts/UserAuthContext'

export function UserLogin() {
  const { login, user, loading: authLoading } = useUserAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!authLoading && user) navigate('/portal', { replace: true })
  }, [authLoading, user, navigate])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/portal')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="portal-root">
      <div className="p-auth">
        {/* Form panel */}
        <div className="auth-panel">
          <div className="auth-card">
            <a href="/" className="auth-brand" style={{ textDecoration: 'none', color: 'inherit' }}>
              <span className="sidebar-mark" />
              <span>Cipher</span>
            </a>
            <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', margin: '0 0 6px' }}>
              Welcome back
            </h1>
            <p className="p-muted" style={{ margin: '0 0 28px', fontSize: 14 }}>
              Sign in to manage your Verifiable Trust Agents.
            </p>

            <form onSubmit={handleSubmit} className="p-col gap-16">
              <div>
                <label className="p-label" htmlFor="lg-email">Email</label>
                <div className="input-group">
                  <svg className="ig-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" />
                  </svg>
                  <input className="p-input" id="lg-email" type="email" placeholder="you@company.com"
                    value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
                </div>
              </div>
              <div>
                <div className="p-row between">
                  <label className="p-label" htmlFor="lg-pass" style={{ marginBottom: 0 }}>Password</label>
                </div>
                <div className="input-group mt-8">
                  <svg className="ig-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <input className="p-input" id="lg-pass" type={showPass ? 'text' : 'password'}
                    placeholder="••••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
                  <button className="ig-suffix" type="button" onClick={() => setShowPass(v => !v)}>
                    {showPass ? 'hide' : 'show'}
                  </button>
                </div>
              </div>

              {error && (
                <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{error}</p>
              )}

              <button className="btn btn-default btn-lg btn-block mt-8" type="submit" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
                {!loading && <span className="arrow">→</span>}
              </button>
            </form>

            <p className="p-muted text-xs mt-24" style={{ textAlign: 'center' }}>
              Protected by Cipher · <span className="p-mono">did:cipher:network</span>
            </p>
          </div>
        </div>

        {/* Aside */}
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
