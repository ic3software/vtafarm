import { useCallback, useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faDiscord } from '@fortawesome/free-brands-svg-icons'
import { Check, Copy, ExternalLink, KeyRound, Smartphone, X } from 'lucide-react'
import { api, PUBLIC_SIGNUP_CONFIG, type ApiError, type PublicPoolClaim } from '@/lib/api'
import { KEYRING_DOWNLOADS, type KeyringDownload } from '@/lib/keyringDownloads'
import { keyringSameDeviceLink } from '@/lib/utils'
import { NavBar } from '@/components/home/NavBar'
import { KeyringStoreButton } from '@/components/KeyringStoreButton'
import '@/styles/get-started.css'

const claimStorageKey = 'vtafarm:public-signup-claim'
const activeStatuses = new Set(['open', 'claimed', 'confirmed', 'provisioning'])

type StoredClaim = { accessToken: string; requestId?: string; completed?: boolean }

function newAccessToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function readStoredClaim(): StoredClaim | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(claimStorageKey) ?? 'null') as StoredClaim | null
    return parsed?.accessToken ? parsed : null
  } catch {
    return null
  }
}

function writeStoredClaim(value: StoredClaim) {
  sessionStorage.setItem(claimStorageKey, JSON.stringify(value))
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function developmentTriggerFromLink(link: string) {
  try {
    const values = new URLSearchParams(new URL(link).hash.slice(1))
    const claimID = values.get('_id') ?? ''
    const farmDID = values.get('_from') ?? ''
    return claimID && farmDID ? { claimID, farmDID } : null
  } catch {
    return null
  }
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

export function GetStarted() {
  const [claim, setClaim] = useState<PublicPoolClaim | null>(null)
  const [stored, setStored] = useState<StoredClaim | null>(() => readStoredClaim())
  const [initializing, setInitializing] = useState(() => readStoredClaim() !== null)
  const [busy, setBusy] = useState(false)
  const [action, setAction] = useState<'confirm' | 'reject' | null>(null)
  const [error, setError] = useState('')
  const [clockMs, setClockMs] = useState(0)
  const [serverOffsetMs, setServerOffsetMs] = useState(0)
  const [copiedClaimID, setCopiedClaimID] = useState(false)
  const [copiedClaimCommand, setCopiedClaimCommand] = useState(false)
  const [download, setDownload] = useState<KeyringDownload | null>(null)
  const [completed, setCompleted] = useState(() => readStoredClaim()?.completed ?? false)
  const cancellingRequestIdRef = useRef<string | null>(null)
  const claimStatus = claim?.connection.status
  const claimRequestId = claim?.connection.request_id

  const applyClaim = useCallback((next: PublicPoolClaim, accessToken: string) => {
    const clientNow = Date.now()
    const serverNow = Date.parse(next.server_time)
    setClockMs(clientNow)
    setServerOffsetMs(Number.isFinite(serverNow) ? serverNow - clientNow : 0)
    setClaim(next)
    const previous = readStoredClaim()
    const nextStored: StoredClaim = {
      accessToken,
      requestId: next.connection.request_id,
      completed: previous?.accessToken === accessToken && previous.completed,
    }
    writeStoredClaim(nextStored)
    setCompleted(next.connection.status === 'released' && Boolean(nextStored.completed))
    setStored(current => current?.accessToken === nextStored.accessToken && current.requestId === nextStored.requestId
      ? current
      : nextStored)
  }, [])

  const loadClaim = useCallback(async (current: StoredClaim) => {
    try {
      const next = current.requestId
        ? await api.getPublicPoolClaim(current.requestId, current.accessToken)
        : await api.createPublicPoolClaim(current.accessToken)
      if (current.requestId && cancellingRequestIdRef.current === current.requestId) return
      if (readStoredClaim()?.accessToken !== current.accessToken) return
      applyClaim(next, current.accessToken)
      setError('')
    } catch (err) {
      if (current.requestId && cancellingRequestIdRef.current === current.requestId) return
      if (readStoredClaim()?.accessToken !== current.accessToken) return
      const apiError = err as ApiError
      if (apiError.status === 404 || apiError.reason === 'connection_expired') {
        sessionStorage.removeItem(claimStorageKey)
        setStored(null)
        setClaim(null)
      } else {
        setError(err instanceof Error ? err.message : 'Unable to resume this Trust Agent claim.')
      }
    }
  }, [applyClaim])

  useEffect(() => {
    if (!stored || claim) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void loadClaim(stored).finally(() => {
        if (!cancelled) setInitializing(false)
      })
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [claim, loadClaim, stored])

  useEffect(() => {
    if (!claimStatus || !claimRequestId || !stored?.requestId || !activeStatuses.has(claimStatus)) return
    let stopped = false
    let timer: number | undefined
    const poll = async () => {
      await loadClaim(stored)
      if (!stopped) timer = window.setTimeout(() => { void poll() }, 1500)
    }
    timer = window.setTimeout(() => { void poll() }, 1500)
    return () => {
      stopped = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [claimRequestId, claimStatus, loadClaim, stored])

  useEffect(() => {
    if (claimStatus !== 'open') return
    const timer = window.setInterval(() => setClockMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [claimStatus])

  async function startClaim() {
    setBusy(true)
    setError('')
    let current = readStoredClaim()
    if (!current) {
      current = { accessToken: newAccessToken() }
      writeStoredClaim(current)
      setStored(current)
    }
    try {
      applyClaim(await api.createPublicPoolClaim(current.accessToken), current.accessToken)
    } catch (err) {
      const apiError = err as ApiError
      setError(apiError.reason === 'public_pool_empty'
        ? 'No Trust Agent is available right now. Please try again later or contact us on Discord.'
        : apiError.reason === 'public_signup_disabled'
          ? 'Trust Agent reservation is currently unavailable. Please contact an administrator.'
          : err instanceof Error ? err.message : 'Unable to reserve a Trust Agent.')
    } finally {
      setBusy(false)
    }
  }

  async function confirmClaim() {
    if (!claim || !stored) return
    setAction('confirm')
    setError('')
    try {
      applyClaim(await api.confirmPublicPoolClaim(claim.connection.request_id, stored.accessToken), stored.accessToken)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to confirm this Trust Agent claim.')
    } finally {
      setAction(null)
    }
  }

  async function rejectClaim() {
    if (!claim || !stored) return
    const requestId = claim.connection.request_id
    cancellingRequestIdRef.current = requestId
    setAction('reject')
    setError('')
    try {
      await api.rejectPublicPoolClaim(requestId, stored.accessToken)
      startOver()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reject this Trust Agent claim.')
    } finally {
      if (cancellingRequestIdRef.current === requestId) cancellingRequestIdRef.current = null
      setAction(null)
    }
  }

  function startOver() {
    sessionStorage.removeItem(claimStorageKey)
    setStored(null)
    setClaim(null)
    setCompleted(false)
    setError('')
  }

  function markCompleted() {
    const current = readStoredClaim()
    if (current) {
      const next = { ...current, completed: true }
      writeStoredClaim(next)
      setStored(next)
    }
    setCompleted(true)
  }

  async function copyDevelopmentClaimID() {
    if (!developmentClaimID) return
    try {
      await navigator.clipboard.writeText(developmentClaimID)
      setCopiedClaimID(true)
      window.setTimeout(() => setCopiedClaimID(false), 1800)
    } catch {
      setError('Unable to copy the claim ID. Select and copy it below.')
    }
  }

  async function copyDevelopmentClaimCommand() {
    if (!developmentClaimCommand) return
    try {
      await navigator.clipboard.writeText(developmentClaimCommand)
      setCopiedClaimCommand(true)
      window.setTimeout(() => setCopiedClaimCommand(false), 1800)
    } catch {
      setError('Unable to copy the development command. Select and copy it below.')
    }
  }

  function openKeyringDownload(option: KeyringDownload) {
    if (window.matchMedia('(max-width: 620px), (pointer: coarse)').matches) {
      window.location.assign(option.url)
      return
    }
    setDownload(option)
  }

  const connection = claim?.connection
  const platformVTC = claim?.platform_vtc
  const developmentTrigger = import.meta.env.DEV && connection?.trigger_link
    ? developmentTriggerFromLink(connection.trigger_link)
    : null
  const developmentClaimID = developmentTrigger?.claimID ?? ''
  const developmentClaimCommand = developmentTrigger
    ? `make dev-claim HANDLE=${shellQuote(developmentTrigger.claimID)} FARM_DID=${shellQuote(developmentTrigger.farmDID)}`
    : ''
  const remaining = connection?.status === 'open'
    ? Math.max(0, Math.ceil((Date.parse(connection.expires_at) - (clockMs + serverOffsetMs)) / 1000))
    : null
  const activePhase = completed ? 4 : connection?.status === 'released' ? 3 : connection || busy ? 2 : 1

  return (
    <main className="signup-page">
      <NavBar />

      <section className="signup-hero">
        <h1>From your phone to your first community.</h1>
      </section>

      {!initializing && (
        <ol className="signup-stepper" aria-label="Onboarding progress">
          {['Install Keyring', 'Link your Trust Agent', 'Join the demo community'].map((label, index) => {
            const phase = index + 1
            const complete = phase < activePhase
            return (
              <li key={label} className={phase === activePhase ? 'is-active' : complete ? 'is-complete' : ''} aria-current={phase === activePhase ? 'step' : undefined}>
                <span>{complete ? <Check aria-hidden="true" /> : phase}</span>{label}
              </li>
            )
          })}
        </ol>
      )}

      <section className="signup-layout">
        <div className="signup-main-card" aria-busy={initializing}>
          {initializing ? (
            <div className="signup-progress" role="status" aria-live="polite">
              <span className="signup-spinner" />
              <h2>Loading your progress…</h2>
              <p>Checking your saved Trust Agent claim.</p>
            </div>
          ) : !connection ? (
            <>
              <div className="signup-section-head"><span>01</span><div><h2>Install Keyring</h2></div></div>
              <div className="signup-downloads">
                <KeyringStoreButton store="ios" type="button" onClick={() => openKeyringDownload(KEYRING_DOWNLOADS.ios)} />
                <KeyringStoreButton store="android" type="button" onClick={() => openKeyringDownload(KEYRING_DOWNLOADS.android)} />
              </div>
              <div className="signup-reserve">
                <div><p>Finished installing Keyring?</p><h2>Next, get your Trust Agent.</h2></div>
                <button type="button" onClick={() => void startClaim()} disabled={busy}>{busy ? 'Reserving…' : 'Get my Trust Agent'}</button>
              </div>
            </>
          ) : connection.status === 'open' ? (
            <div className="signup-claim-grid">
              <div className={`signup-qr${action === 'reject' ? ' is-cancelling' : ''}`}>
                {connection.trigger_link && <QRCodeSVG value={connection.trigger_link} size={280} level="M" marginSize={4} title="Keyring Trust Agent claim QR code" />}
                {action === 'reject' && <div className="signup-qr-cancelling"><X aria-hidden="true" /><strong>Cancelling QR…</strong><span>Returning to the first step.</span></div>}
              </div>
              <div className="signup-claim-copy">
                <div className="signup-section-head"><span>02</span><div><h2>Link your Trust Agent</h2><p className="signup-qr-only">Scan the code from Keyring (QR Code &gt; Scan).</p></div></div>
                {connection.trigger_link && (action === 'reject'
                  ? <button type="button" className="signup-primary-link signup-same-device-only" disabled><Smartphone aria-hidden="true" />Open in Keyring</button>
                  : <a className="signup-primary-link signup-same-device-only" href={keyringSameDeviceLink(connection.trigger_link)}><Smartphone aria-hidden="true" />Open in Keyring</a>)}
                <p className="signup-timer">QR expires in <strong>{formatCountdown(remaining ?? 0)}</strong></p>
                <button type="button" className="signup-text-button" onClick={() => void rejectClaim()} disabled={action !== null}>{action === 'reject' ? 'Cancelling…' : 'Cancel'}</button>
                {developmentClaimID && (
                  <div className="signup-development-claim">
                    <span>Claim ID · development only</span>
                    <div>
                      <code>{developmentClaimID}</code>
                      <button type="button" onClick={() => void copyDevelopmentClaimID()}>
                        <Copy aria-hidden="true" />{copiedClaimID ? 'Copied' : 'Copy ID'}
                      </button>
                    </div>
                    <span className="signup-development-command-label">Local claim command</span>
                    <code className="signup-development-command">{developmentClaimCommand}</code>
                    <button className="signup-development-command-copy" type="button" onClick={() => void copyDevelopmentClaimCommand()}>
                      <Copy aria-hidden="true" />{copiedClaimCommand ? 'Copied command' : 'Copy command'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : connection.status === 'claimed' ? (
            <div className="signup-confirm">
              <KeyRound aria-hidden="true" />
              <p className="signup-eyebrow">Security check</p>
              <h2>Compare this code with Keyring</h2>
              <div className="signup-claim-check">{connection.claim_check}</div>
              <div className="signup-confirm-actions">
                <button type="button" onClick={() => void confirmClaim()} disabled={action !== null}>{action === 'confirm' ? 'Confirming…' : 'Codes match'}</button>
                <button type="button" className="secondary" onClick={() => void rejectClaim()} disabled={action !== null}>{action === 'reject' ? 'Rejecting…' : 'Not mine'}</button>
              </div>
            </div>
          ) : connection.status === 'confirmed' || connection.status === 'provisioning' ? (
            <div className="signup-progress"><span className="signup-spinner" /><h2>Your Trust Agent is being activated</h2><p>Keep Keyring open. The handover completes automatically.</p></div>
          ) : connection.status === 'released' ? (
            <div className="signup-released">
              <div className="signup-success"><Check aria-hidden="true" /><div><h2>Your Trust Agent is linked to Keyring</h2><code>{connection.vta_did}</code></div></div>
              {completed ? (
                <div className="signup-finished">
                  <Check aria-hidden="true" />
                  <p className="signup-eyebrow">Complete</p>
                  <h2>You&rsquo;re all set</h2>
                  <p>Your Trust Agent is linked and your onboarding steps are complete.</p>
                  <a href="/" onClick={() => sessionStorage.removeItem(claimStorageKey)}>Go to the homepage</a>
                </div>
              ) : platformVTC ? (
                <>
                  <div className="signup-community-grid">
                    <div>
                      <p className="signup-eyebrow">1 of 3</p>
                      <h2>Join the demo community</h2>
                      <p className="signup-qr-only">Open the demo community site and scan the QR code.</p>
                      <p className="signup-same-device-only">Open the demo community site and click the <em>Join in Keyring</em> button.</p>
                    </div>
                    <a href={platformVTC.url} target="_blank" rel="noreferrer">Open community site <ExternalLink aria-hidden="true" /></a>
                  </div>
                  <div className="signup-next-steps">
                    <div className="signup-membership">
                      <p className="signup-eyebrow">2 of 3</p>
                      <h2>Submit your join request</h2>
                      <p>Confirm in Keyring. The demo community will show as <strong>Pending</strong> until an administrator approves it.</p>
                    </div>
                    <div className="signup-discord">
                      <div>
                        <p className="signup-eyebrow">3 of 3</p>
                        <h2>Request approval on Discord</h2>
                        <p>When the demo community shows as <strong>Pending</strong>, tell an administrator your request is ready.</p>
                      </div>
                      {PUBLIC_SIGNUP_CONFIG.discordUrl
                        ? <a href={PUBLIC_SIGNUP_CONFIG.discordUrl} target="_blank" rel="noreferrer"><FontAwesomeIcon icon={faDiscord} aria-hidden="true" />Join Discord</a>
                        : <button type="button" disabled title="Discord invitation coming soon"><FontAwesomeIcon icon={faDiscord} aria-hidden="true" />Join Discord</button>}
                    </div>
                  </div>
                  <div className="signup-finish-actions">
                    <button type="button" onClick={markCompleted}>I&rsquo;ve finished</button>
                  </div>
                </>
              ) : (
                <div className="signup-community-unavailable" role="alert">
                  <h2>The demo community is not ready</h2>
                  <p>This Farm&rsquo;s platform VTC is unavailable. Please contact an administrator before submitting a join request.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="signup-progress"><h2>This claim was {connection.status}</h2><p>No Trust Agent was handed over. Generate a fresh QR to try again.</p><button type="button" onClick={startOver}>Generate another QR</button></div>
          )}
          {error && <p className="signup-error" role="alert">{error}</p>}
        </div>

      </section>

      {download && (
        <div className="signup-download-overlay" role="presentation" onMouseDown={() => setDownload(null)}>
          <div className="signup-download-dialog" role="dialog" aria-modal="true" aria-labelledby="keyring-download-title" onMouseDown={event => event.stopPropagation()}>
            <div className="signup-download-header">
              <h2 id="keyring-download-title">Download Keyring</h2>
              <p>Scan to open {download.storeName}.</p>
            </div>
            <div className="signup-download-body">
              <QRCodeSVG className="signup-download-qr" value={download.url} size={240} level="M" marginSize={4} title={`${download.storeName} download QR code`} />
            </div>
            <div className="signup-download-footer">
              <button type="button" onClick={() => setDownload(null)}>Close</button>
              <a href={download.url} target="_blank" rel="noreferrer">Open {download.storeName}</a>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
