import { useEffect, useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { startAuthentication } from '@simplewebauthn/browser'
import { QRCodeSVG } from 'qrcode.react'
import '@/styles/portal.css'
import { api } from '@/lib/api'
import { useUserAuth } from '@/contexts/userAuth'
import { keyringSameDeviceLink } from '@/lib/utils'
import {
  cancelKeyringRequest,
  fetchKeyringSignInConfig,
  forgetKeyringRequest,
  KeyringSignInError,
  openKeyringRequest,
  redeemKeyringRequest,
  type KeyringAccountChoice,
  type KeyringRequest,
  type KeyringSignInConfig,
} from '@/lib/keyringSignIn'

export function UserLogin() {
  const { user, setUserSession } = useUserAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [keyringConfig, setKeyringConfig] = useState<KeyringSignInConfig | null>(null)
  const [keyringRequest, setKeyringRequest] = useState<KeyringRequest | null>(null)
  const [keyringStatus, setKeyringStatus] = useState('')
  const [matchNumber, setMatchNumber] = useState('')
  const [accountChoices, setAccountChoices] = useState<KeyringAccountChoice[]>([])
  const [selectedBindingId, setSelectedBindingId] = useState<number | undefined>()
  const [tabVisible, setTabVisible] = useState(!document.hidden)

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

  async function handleKeyringLogin() {
    setError('')
    setLoading(true)
    setMatchNumber('')
    setAccountChoices([])
    setSelectedBindingId(undefined)
    setKeyringStatus('Creating a private sign-in request…')
    try {
      const config = await fetchKeyringSignInConfig()
      const request = await openKeyringRequest(config)
      setKeyringConfig(config)
      setKeyringRequest(request)
      setKeyringStatus('Scan the code or open it in Keyring, then approve the sign-in.')
    } catch (err) {
      forgetKeyringRequest()
      setKeyringStatus('')
      setError(err instanceof Error ? err.message : 'Unable to start Keyring sign-in.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCancelKeyring() {
    const config = keyringConfig
    const request = keyringRequest
    setKeyringRequest(null)
    setKeyringConfig(null)
    setMatchNumber('')
    setAccountChoices([])
    setSelectedBindingId(undefined)
    setKeyringStatus('')
    if (config && request) await cancelKeyringRequest(config, request.requestId)
  }

  useEffect(() => {
    const onVisibility = () => setTabVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(() => {
    if (!keyringConfig || !keyringRequest) return
    let stopped = false
    let timer = 0
    let controller: AbortController | null = null

    const poll = async () => {
      if (stopped) return
      if (document.hidden) {
        timer = window.setTimeout(poll, 500)
        return
      }
      controller = new AbortController()
      try {
        const result = await redeemKeyringRequest(keyringConfig, keyringRequest.requestId, controller.signal, selectedBindingId)
        if (stopped) return
        forgetKeyringRequest()
        setUserSession(result.user)
        navigate('/portal')
      } catch (err) {
        if (stopped || (err as { name?: string }).name === 'AbortError') return
        if (err instanceof TypeError && Date.now() < keyringRequest.claimClosesAt + 120_000) {
          setKeyringStatus('Connection interrupted. Retrying this signed request…')
          timer = window.setTimeout(poll, 1000)
          return
        }
        if (err instanceof KeyringSignInError && (err.code === 'pending' || err.code === 'accountSelectionRequired')) {
          const number = typeof err.details.matchNumber === 'string' ? err.details.matchNumber : ''
          const state = typeof err.details.state === 'string' ? err.details.state : 'pending'
          const accounts = Array.isArray(err.details.accounts)
            ? err.details.accounts.filter((choice): choice is KeyringAccountChoice => {
                const candidate = choice as Partial<KeyringAccountChoice>
                return Number.isSafeInteger(candidate.bindingId) && typeof candidate.displayName === 'string'
              })
            : []
          setMatchNumber(number)
          if (accounts.length > 0) {
            setAccountChoices(accounts)
            setKeyringStatus('This Keyring identity can access more than one Farm account. Select the account for this sign-in.')
            return
          }
          setKeyringStatus(number
            ? `Keyring claimed this request. Enter ${number} in Keyring and approve.`
            : state === 'identified' ? 'Identity verified. Waiting for your approval in Keyring…' : 'Waiting for Keyring…')
          timer = window.setTimeout(poll, 900)
          return
        }
        setKeyringRequest(null)
        setKeyringConfig(null)
        setMatchNumber('')
        setAccountChoices([])
        setSelectedBindingId(undefined)
        forgetKeyringRequest()
        setError(err instanceof Error ? err.message : 'Keyring sign-in failed.')
      }
    }

    void poll()
    return () => {
      stopped = true
      controller?.abort()
      window.clearTimeout(timer)
    }
  }, [keyringConfig, keyringRequest, navigate, selectedBindingId, setUserSession])

  if (user) return <Navigate to="/portal" replace />

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
              Sign in with Keyring or your passkey to manage your Trust Agent.
            </p>

            {keyringRequest ? (
              <div style={{ display: 'grid', gap: 14, marginBottom: 18 }}>
                <div style={{ display: 'grid', placeItems: 'center', minHeight: 220, padding: 14, border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', background: '#fff' }}>
                  {tabVisible ? (
                    <a href={keyringSameDeviceLink(keyringRequest.triggerLink)} aria-label="Open sign-in request in Keyring">
                      <QRCodeSVG value={keyringRequest.triggerLink} size={190} level="M" />
                    </a>
                  ) : (
                    <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>Sign-in code hidden while this tab is inactive.</span>
                  )}
                </div>
                {matchNumber && (
                  <div style={{ textAlign: 'center', padding: '12px 16px', borderRadius: 'var(--radius)', background: 'hsl(var(--muted))' }}>
                    <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}>Number shown to Keyring</div>
                    <div className="p-mono" style={{ fontSize: 34, fontWeight: 700, letterSpacing: '.18em' }}>{matchNumber}</div>
                  </div>
                )}
                {accountChoices.length > 0 && selectedBindingId === undefined && (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {accountChoices.map(choice => (
                      <button
                        key={choice.bindingId}
                        className="btn btn-outline btn-block"
                        type="button"
                        onClick={() => {
                          setKeyringStatus(`Continuing as ${choice.displayName}…`)
                          setSelectedBindingId(choice.bindingId)
                        }}
                      >
                        Continue as {choice.displayName}
                      </button>
                    ))}
                  </div>
                )}
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'hsl(var(--muted-foreground))' }}>{keyringStatus}</p>
                <a className="btn btn-default btn-lg btn-block" href={keyringSameDeviceLink(keyringRequest.triggerLink)}>
                  Open in Keyring <span className="arrow">→</span>
                </a>
                <button className="btn btn-ghost btn-block" type="button" onClick={() => void handleCancelKeyring()}>Cancel</button>
              </div>
            ) : (
              <button
                className="btn btn-default btn-lg btn-block"
                type="button"
                onClick={handleKeyringLogin}
                disabled={loading}
                style={{ gap: 10, marginBottom: 12 }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 18, height: 18, flexShrink: 0 }}>
                  <rect x="3" y="5" width="18" height="14" rx="2"/><path d="M16 12h.01M7 9h5M7 13h5"/>
                </svg>
                {loading ? 'Starting Keyring…' : 'Sign in with Keyring'}
                {!loading && <span className="arrow">→</span>}
              </button>
            )}

            <button
              className="btn btn-outline btn-lg btn-block"
              type="button"
              onClick={handlePasskeyLogin}
              disabled={loading || Boolean(keyringRequest)}
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
