import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { startRegistration } from '@simplewebauthn/browser'
import '@/styles/portal.css'
import { api } from '@/lib/api'
import { useUserAuth } from '@/contexts/userAuth'

export function Recover() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { setUserSession } = useUserAuth()

  // Derived from the URL rather than set in the effect below: a missing token
  // is knowable on the first render, and setting it there forced a second one.
  const [validating, setValidating] = useState(!!token)
  const [tokenError, setTokenError] = useState(token ? '' : 'Invalid recovery link.')
  const [expiresAt, setExpiresAt] = useState('')

  // Set once the link is consumed — retries after a failed passkey ceremony
  // must skip the consume step (the link is single-use, but the login cookie
  // it set is still valid).
  const [account, setAccount] = useState<{ id: number; unique_id: string } | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    api.validateRecovery(token)
      .then(res => setExpiresAt(res.expires_at))
      .catch(err => {
        const status = (err as { status?: number }).status
        if (status === 410) setTokenError('This recovery link has already been used or has expired.')
        else if (status === 404) setTokenError('Recovery link not found.')
        else setTokenError('Unable to validate this recovery link.')
      })
      .finally(() => setValidating(false))
  }, [token])

  async function handleRecover() {
    if (!token) return
    setError('')
    setLoading(true)
    try {
      // Consuming burns the link, revokes the account's old passkeys, and sets
      // the login cookie — don't publish the session to React state yet, only
      // after the new passkey is saved on the server.
      const recovered = account ?? await api.consumeRecovery(token)
      setAccount(recovered)

      const options = await api.passkeyRegisterBegin()
      const credential = await startRegistration({ optionsJSON: options.publicKey as never })
      await api.passkeyRegisterComplete('My Passkey', credential)

      setUserSession({ id: recovered.id, unique_id: recovered.unique_id, role: 'user' })
      navigate('/portal')
    } catch (err) {
      if ((err as { name?: string }).name === 'NotAllowedError') {
        setError('Passkey setup was cancelled. Please try again.')
      } else if ((err as { status?: number }).status === 410) {
        setTokenError('This recovery link has already been used or has expired.')
      } else {
        setError(err instanceof Error ? err.message : 'Recovery failed.')
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
                  Verifying recovery link…
                </h1>
                <p className="p-muted" style={{ margin: 0, fontSize: 14 }}>Please wait.</p>
              </>
            ) : tokenError ? (
              <>
                <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', margin: '0 0 8px' }}>
                  Invalid recovery link
                </h1>
                <p style={{ margin: '0 0 24px', fontSize: 14, color: 'hsl(var(--destructive))' }}>{tokenError}</p>
                <p className="p-muted" style={{ margin: '0 0 24px', fontSize: 13 }}>
                  Contact your administrator to get a new one.
                </p>
                <a href="/" className="btn btn-default btn-block" style={{ textDecoration: 'none', textAlign: 'center' }}>
                  Back to home
                </a>
              </>
            ) : (
              <>
                <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', margin: '0 0 6px' }}>
                  Recover your account
                </h1>
                <p className="p-muted" style={{ margin: '0 0 28px', fontSize: 14 }}>
                  An administrator issued this link for your account.
                  {expiresAt && <> It expires <strong>{fmtExpiry(expiresAt)}</strong>.</>}
                  {' '}Your device will prompt you to create a new passkey; any
                  previous passkeys on this account will be revoked.
                </p>

                <button
                  className="btn btn-default btn-lg btn-block"
                  type="button"
                  onClick={handleRecover}
                  disabled={loading}
                  style={{ gap: 10 }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 18, height: 18, flexShrink: 0 }}>
                    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                  </svg>
                  {loading ? 'Recovering…' : 'Recover with a new Passkey'}
                  {!loading && <span className="arrow">→</span>}
                </button>

                {error && (
                  <p style={{ margin: '12px 0 0', fontSize: 13, color: 'hsl(var(--destructive))' }}>{error}</p>
                )}
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
