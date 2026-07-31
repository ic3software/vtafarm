import { useState, useEffect, useRef, type MouseEvent } from 'react'
import {
  api,
  type SetupSession,
  type SetupSessionUrls,
  type SetupSessionCollected,
  type SharingResponse,
  type StackConnection,
  type StackConnectionSummary,
} from '@/lib/api'
import { useCopyState, statusBadge } from './portalUtils'
import { userSessionActions, type SessionActionApi } from './sessionActions'

function CopyIcon({ copied }: { copied: boolean }) {
  return copied
    ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width: 14, height: 14 }}><path d="M20 6 9 17l-5-5"/></svg>
    : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 14, height: 14 }}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
}

function Row({
  label, value, hint, copyKey, copiedKey, onCopy,
}: {
  label: string
  value: string
  hint?: string
  copyKey: string
  copiedKey: string | null
  onCopy: (key: string, value: string) => void
}) {
  const copied = copiedKey === copyKey
  return (
    <div className="p-card" style={{ background: 'hsl(var(--muted)/.4)', border: 'none' }}>
      <div className="card-content" style={{ padding: '12px 16px' }}>
        <div className="p-row between center" style={{ gap: 12 }}>
          <div className="p-col" style={{ minWidth: 0 }}>
            <span className="p-muted text-xs" style={{ letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
              {label}
            </span>
            <p className="p-mono" style={{ margin: '4px 0 0', fontSize: 12, wordBreak: 'break-all', color: 'hsl(var(--foreground))' }}>
              {value}
            </p>
            {hint && <span className="field-hint" style={{ marginTop: 4 }}>{hint}</span>}
          </div>
          <button className="btn btn-outline btn-sm" style={{ flexShrink: 0, gap: 6 }} onClick={() => onCopy(copyKey, value)}>
            <CopyIcon copied={copied} />
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SecretRow({
  label, value, hint, copyKey, copiedKey, onCopy,
}: {
  label: string
  value: string
  hint: string
  copyKey: string
  copiedKey: string | null
  onCopy: (key: string, value: string) => void
}) {
  const [revealed, setRevealed] = useState(false)
  const copied = copiedKey === copyKey
  return (
    <div className="p-card" style={{ background: 'hsl(var(--muted)/.4)', border: 'none' }}>
      <div className="card-content" style={{ padding: '12px 16px' }}>
        <div className="p-row between center" style={{ gap: 12 }}>
          <div className="p-col" style={{ minWidth: 0 }}>
            <span className="p-muted text-xs" style={{ letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
              {label}
            </span>
            <p className="p-mono" style={{ margin: '4px 0 0', fontSize: 12, wordBreak: 'break-all', color: 'hsl(var(--foreground))' }}>
              {revealed ? value : '•'.repeat(28)}
            </p>
            <span className="field-hint" style={{ marginTop: 4 }}>{hint}</span>
          </div>
          <div className="p-row gap-8" style={{ flexShrink: 0 }}>
            <button className="btn btn-outline btn-sm" onClick={() => setRevealed(v => !v)}>
              {revealed ? 'Hide' : 'Reveal'}
            </button>
            <button className="btn btn-outline btn-sm" style={{ gap: 6 }} onClick={() => onCopy(copyKey, value)}>
              <CopyIcon copied={copied} />
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Shared state for the single-use DID-hosting admin enrollment link, split
// across two render sites: DidsEnrollAlert (top banner, actionable state
// only) and DidsEnrollConfigRow (Configuration card, reissue once used).
export function useDidsEnroll(session: SetupSession | null, actions: SessionActionApi = userSessionActions) {
  const [enrollUrl, setEnrollUrl] = useState('')
  const [used, setUsed] = useState(false)
  const [reissuing, setReissuing] = useState(false)
  const [reissueError, setReissueError] = useState('')
  const [justReissued, setJustReissued] = useState(false)

  // Follow the polled session until the user acts (open/reissue) — the URL
  // only shows up mid-pipeline, so a seed-once from the first session that
  // arrives would miss it in the create-progress flow. After a local action,
  // handleOpen/handleReissue own these values.
  const touched = useRef(false)
  useEffect(() => {
    if (!session || touched.current) return
    setEnrollUrl(session.action_required?.dids_admin_enroll_url ?? '')
    setUsed(session.dids_enroll_used ?? false)
  }, [session])

  function handleOpen() {
    if (!session) return
    touched.current = true
    setUsed(true)
    actions.ackDidsEnroll(session.id).catch(() => {})
  }

  async function handleReissue() {
    if (!session) return
    touched.current = true
    setReissuing(true)
    setReissueError('')
    try {
      const r = await actions.reissueDidsEnroll(session.id)
      setEnrollUrl(r.dids_admin_enroll_url)
      setUsed(false)
      setJustReissued(true)
    } catch (err) {
      setReissueError(err instanceof Error ? err.message : 'Failed to reissue enrollment link')
    } finally {
      setReissuing(false)
    }
  }

  return { enrollUrl, used, reissuing, reissueError, justReissued, handleOpen, handleReissue }
}

export type DidsEnrollState = ReturnType<typeof useDidsEnroll>

// Single-use DID-hosting admin enrollment link — shown at the top of the
// completed/running page, only while there's still something to do (an
// unopened link). Once opened, this disappears; reissuing a new one lives in
// the Configuration card instead (see DidsEnrollConfigRow).
export function DidsEnrollAlert({ enrollUrl, used, justReissued, handleOpen }: DidsEnrollState) {
  if (!enrollUrl || used) return null

  return (
    <div className="p-alert alert-warning" style={{ marginBottom: 16 }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>
      <div className="grow">
        <p className="alert-title">DID hosting admin enrollment</p>
        <p className="alert-desc">
          Visit this single-use link to register a passkey for the DID hosting admin panel.
          {justReissued && (
            <span style={{ display: 'block', marginTop: 4 }}>
              Reissuing restarts the DID hosting service — wait 10 seconds before opening the new link.
            </span>
          )}
        </p>
      </div>
      <div className="p-row gap-8" style={{ flexShrink: 0 }}>
        <a className="btn btn-outline btn-sm" href={enrollUrl} target="_blank" rel="noopener" onClick={handleOpen}>Open enrollment →</a>
      </div>
    </div>
  )
}

// Reissue control for the DID-hosting admin enrollment link — lives in the
// Configuration card, and only appears once the original link has been
// opened (before that, the top banner's "Open enrollment" is the action).
export function DidsEnrollConfigRow({ used, reissuing, reissueError, justReissued, handleReissue }: DidsEnrollState) {
  if (!used) return null

  return (
    <>
      <hr className="p-sep"/>
      <div className="p-row between center" style={{ gap: 12 }}>
        <div className="p-col" style={{ minWidth: 0 }}>
          <span className="p-muted text-sm">DID hosting enrollment</span>
          <span className="field-hint" style={{ marginTop: 4 }}>
            {justReissued
              ? 'Reissuing restarts the DID hosting service — wait 10 seconds before opening the new link.'
              : 'Link already opened. Reissue a new one to register a passkey.'}
          </span>
          {reissueError && <span style={{ color: 'hsl(var(--destructive))', display: 'block', marginTop: 4 }} className="field-hint">{reissueError}</span>}
        </div>
        <button className="btn btn-outline btn-sm" style={{ flexShrink: 0 }} onClick={handleReissue} disabled={reissuing}>
          {reissuing ? 'Reissuing…' : 'Reissue link'}
        </button>
      </div>
    </>
  )
}

// Shared state for the one-shot VTC admin install URL + claim code — the
// VTC counterpart of useDidsEnroll, split across the same two
// render sites (VtcInstallAlert top banner / VtcInstallConfigRow reissue).
// The setup-minted install token expires after 15 minutes, so reissuing is
// the expected path, not an edge case.
export function useVtcInstall(session: SetupSession | null, actions: SessionActionApi = userSessionActions) {
  const [installUrl, setInstallUrl] = useState('')
  const [claimCode, setClaimCode] = useState('')
  const [used, setUsed] = useState(false)
  const [reissuing, setReissuing] = useState(false)
  const [reissueError, setReissueError] = useState('')
  const [justReissued, setJustReissued] = useState(false)

  // Follow the polled session until the user acts — same convention as
  // useDidsEnroll. The install URL only appears at the very end of the
  // pipeline (after step_vtc_setup), so seeding once from the first session
  // would always miss it in the create-progress flow.
  const touched = useRef(false)
  useEffect(() => {
    if (!session || touched.current) return
    setInstallUrl(session.action_required?.install_url ?? '')
    setClaimCode(session.action_required?.claim_code ?? '')
    setUsed(session.vtc_install_used ?? false)
  }, [session])

  function handleOpen() {
    if (!session) return
    touched.current = true
    setUsed(true)
    actions.ackVtcInstall(session.id).catch(() => {})
  }

  async function handleReissue() {
    if (!session) return
    touched.current = true
    setReissuing(true)
    setReissueError('')
    try {
      const r = await actions.reissueVtcInstall(session.id)
      setInstallUrl(r.install_url)
      setClaimCode(r.claim_code)
      setUsed(false)
      setJustReissued(true)
    } catch (err) {
      setReissueError(err instanceof Error ? err.message : 'Failed to reissue install link')
    } finally {
      setReissuing(false)
    }
  }

  return { installUrl, claimCode, used, reissuing, reissueError, justReissued, handleOpen, handleReissue }
}

export type VtcInstallState = ReturnType<typeof useVtcInstall>

// One-shot VTC admin install link + second-channel claim code — shown at the
// top of the completed/running page while there's still an unopened link.
// The VTC refuses a claim without both values, so the claim code must be
// copied before the (single-use) link can be opened. Reissuing lives in the
// Configuration card (VtcInstallConfigRow), not here.
export function VtcInstallAlert({ installUrl, claimCode, used, reissueError, justReissued, handleOpen }: VtcInstallState) {
  const { copiedKey, copy } = useCopyState()
  // Gate the one-shot link on copying the claim code first — the claimed flag
  // persists past useCopyState's transient "Copied!" timeout, and resets when a
  // reissue mints a fresh claim code so the new one must be copied again
  // (render-phase reset per the React "adjust state on prop change" pattern).
  const [claimCopied, setClaimCopied] = useState(false)
  const [openWarning, setOpenWarning] = useState(false)
  const [seenClaimCode, setSeenClaimCode] = useState(claimCode)
  if (seenClaimCode !== claimCode) {
    setSeenClaimCode(claimCode)
    setClaimCopied(false)
    setOpenWarning(false)
  }
  if (!installUrl || used) return null

  const copied = copiedKey === 'vtc-claim-code'
  const needsCopyFirst = !!claimCode && !claimCopied

  function handleOpenClick(e: MouseEvent<HTMLAnchorElement>) {
    if (needsCopyFirst) {
      e.preventDefault()
      setOpenWarning(true)
      return
    }
    handleOpen()
  }

  return (
    <div className="p-alert alert-warning" style={{ marginBottom: 16 }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>
      <div className="grow">
        <p className="alert-title">VTC admin install</p>
        <p className="alert-desc">
          Copy the claim code below first, then open the one-shot link to claim the VTC admin — you'll be asked for it.
          {justReissued && (
            <span style={{ display: 'block', marginTop: 4 }}>
              Reissuing restarts the VTC service — wait 10 seconds before opening the new link.
            </span>
          )}
          {reissueError && (
            <span style={{ display: 'block', marginTop: 4, color: 'hsl(var(--destructive))' }}>{reissueError}</span>
          )}
        </p>
        {claimCode && (
          <div className="p-row gap-8 center" style={{ marginTop: 8 }}>
            <span className="p-muted text-xs" style={{ letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
              Claim code
            </span>
            <span className="p-mono" style={{ fontSize: 13, fontWeight: 600 }}>{claimCode}</span>
            <button className="btn btn-outline btn-sm" style={{ gap: 6 }} onClick={() => { copy('vtc-claim-code', claimCode); setClaimCopied(true); setOpenWarning(false) }}>
              <CopyIcon copied={copied} />
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}
        {openWarning && (
          <span className="field-hint" style={{ display: 'block', marginTop: 8, color: 'hsl(var(--destructive))' }}>
            Copy the claim code first, then open the link.
          </span>
        )}
      </div>
      <div className="p-row gap-8" style={{ flexShrink: 0 }}>
        <a
          className="btn btn-outline btn-sm"
          href={installUrl}
          target="_blank"
          rel="noopener"
          aria-disabled={needsCopyFirst}
          style={needsCopyFirst ? { opacity: 0.55 } : undefined}
          onClick={handleOpenClick}
        >Open link →</a>
      </div>
    </div>
  )
}

// Reissue control for the VTC admin install link — lives in the Configuration
// card once the original link has been opened (before that, the top banner
// owns both actions).
export function VtcInstallConfigRow({ used, reissuing, reissueError, justReissued, handleReissue }: VtcInstallState) {
  if (!used) return null

  return (
    <>
      <hr className="p-sep"/>
      <div className="p-row between center" style={{ gap: 12 }}>
        <div className="p-col" style={{ minWidth: 0 }}>
          <span className="p-muted text-sm">VTC admin install</span>
          <span className="field-hint" style={{ marginTop: 4 }}>
            {justReissued
              ? 'Reissuing restarts the VTC service — wait 10 seconds before opening the new link.'
              : 'Link already opened. Reissue a new one to claim the VTC admin.'}
          </span>
          {reissueError && <span style={{ color: 'hsl(var(--destructive))', display: 'block', marginTop: 4 }} className="field-hint">{reissueError}</span>}
        </div>
        <button className="btn btn-outline btn-sm" style={{ flexShrink: 0 }} onClick={handleReissue} disabled={reissuing}>
          {reissuing ? 'Reissuing…' : 'Reissue link'}
        </button>
      </div>
    </>
  )
}

// Collected DIDs — shown at the top of the completed/running page, below DidsEnrollAlert.
// Admin DIDs (mediator/did-hosting) live in AdminKeysCard instead, alongside their keys.
export function CollectedDidsCard({ collected }: { collected?: SetupSessionCollected }) {
  const { copiedKey, copy } = useCopyState()
  if (!collected || !(collected.vta_did || collected.mediator_did || collected.did_hosting_did || collected.vtc_did)) {
    return null
  }
  return (
    <div className="p-card" style={{ marginBottom: 16 }}>
      <div className="card-header"><h3 className="card-title">Collected DIDs</h3></div>
      <div className="card-content p-col gap-12" style={{ paddingTop: 14 }}>
        {collected.vta_did && (
          <Row label="VTA DID" value={collected.vta_did} copyKey="did-vta" copiedKey={copiedKey} onCopy={copy} />
        )}
        {collected.mediator_did && (
          <Row label="Mediator DID" value={collected.mediator_did} copyKey="did-mediator" copiedKey={copiedKey} onCopy={copy} />
        )}
        {collected.did_hosting_did && (
          <Row label="DID hosting daemon DID" value={collected.did_hosting_did} copyKey="did-daemon" copiedKey={copiedKey} onCopy={copy} />
        )}
        {collected.vtc_did && (
          <Row label="VTC DID" value={collected.vtc_did} copyKey="did-vtc" copiedKey={copiedKey} onCopy={copy} />
        )}
      </div>
    </div>
  )
}

// Right-aligned label/value row for the Configuration card — wraps long URLs
// (right-aligned on every line) instead of overflowing the card like a bare
// flex row does.
export function ConfigLinkRow({ label, href, value }: { label: string; href: string; value: string }) {
  return (
    <div className="p-row between" style={{ gap: 16, alignItems: 'flex-start' }}>
      <span className="p-muted text-sm" style={{ flexShrink: 0 }}>{label}</span>
      <a
        href={href}
        target="_blank"
        rel="noopener"
        className="p-mono text-xs"
        style={{ color: 'hsl(var(--primary))', textAlign: 'right', overflowWrap: 'anywhere', minWidth: 0 }}
      >
        {value}
      </a>
    </div>
  )
}

// Endpoint URL rows meant to be embedded inside an existing "Configuration" card
// (same row style vta_only uses for its single URL row).
export function EndpointConfigRows({ urls }: { urls?: SetupSessionUrls }) {
  if (!urls) return null
  return (
    <>
      <hr className="p-sep"/>
      <ConfigLinkRow label="VTA" href={`${urls.vta}/health`} value={`${urls.vta}/health`} />
      <hr className="p-sep"/>
      <ConfigLinkRow label="Mediator" href={`${urls.mediator}/mediator/v1/healthchecker`} value={`${urls.mediator}/mediator/v1/healthchecker`} />
      <hr className="p-sep"/>
      <ConfigLinkRow label="DID Hosting" href={urls.dids} value={urls.dids} />
      {urls.vtc && (
        <>
          <hr className="p-sep"/>
          <ConfigLinkRow label="VTC" href={urls.vtc} value={urls.vtc} />
        </>
      )}
    </>
  )
}

// Admin DIDs + reveal-once private keys — not actually cleared server-side
// after first view, so keys are a hide-by-default toggle rather than a
// one-shot modal.
export function AdminKeysCard({ session }: { session: SetupSession }) {
  const { copiedKey, copy } = useCopyState()
  const { mediator_admin_did, did_hosting_admin_did } = session.collected ?? {}
  const hasContent = !!(mediator_admin_did || did_hosting_admin_did || session.mediator_admin_key || session.webvh_admin_key)
  if (!hasContent) return null
  return (
    <div className="p-card" style={{ borderColor: 'hsl(var(--warning)/.4)' }}>
      <div className="card-header">
        <h3 className="card-title">Admin DIDs &amp; Private Keys</h3>
        <p className="card-desc">
          Mediator and DID hosting admin identities, plus the private keys backing them — shown
          once for offline backup (e.g. a password manager). They stay visible here until you
          delete this agent, so remove the keys from view once you've saved them.
        </p>
      </div>
      <div className="card-content p-col gap-12" style={{ paddingTop: 14 }}>
        {mediator_admin_did && (
          <Row label="Mediator admin DID" value={mediator_admin_did} copyKey="did-mediator-admin" copiedKey={copiedKey} onCopy={copy} />
        )}
        {did_hosting_admin_did && (
          <Row label="DID hosting admin DID" value={did_hosting_admin_did} copyKey="did-hosting-admin" copiedKey={copiedKey} onCopy={copy} />
        )}
        {session.mediator_admin_key && (
          <SecretRow label="Mediator admin key" value={session.mediator_admin_key} hint="Multibase private key for the mediator admin DID." copyKey="key-mediator" copiedKey={copiedKey} onCopy={copy} />
        )}
        {session.webvh_admin_key && (
          <SecretRow label="WebVH admin key" value={session.webvh_admin_key} hint="Multibase private key for the DID hosting admin DID." copyKey="key-webvh" copiedKey={copiedKey} onCopy={copy} />
        )}
      </div>
    </div>
  )
}

// ── Sharing ──────────────────────────────────────────────────────────────────

/**
 * Lets the owner of a full stack hand out a connection bundle, so somebody
 * else's VTA-only agent can use this stack's mediator and DID hosting.
 *
 * The switch is the grant. There is no separate "generate" step: turning
 * sharing on mints the code, turning it off clears it, and New code replaces
 * it.
 *
 * All three gate *joining*, never membership — which is the one thing people
 * will get wrong, so both confirms say it. There is no way to remove a single
 * connection; the stronger lever is deleting the stack, which stops everyone.
 */
export function ShareStackCard({
  session, onChanged,
}: {
  session: SetupSession
  onChanged?: (r: SharingResponse) => void
}) {
  const { copiedKey, copy } = useCopyState()
  const [shared, setShared] = useState(!!session.shared)
  const [bundle, setBundle] = useState<StackConnection | undefined>(session.connection)
  const [connections, setConnections] = useState<StackConnectionSummary[]>(session.connections ?? [])
  const [busy, setBusy] = useState<'enable' | 'rotate' | 'disable' | null>(null)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState<'rotate' | 'disable' | null>(null)

  // Adopt fresh server state when the polled session changes, without
  // clobbering an in-flight action (React "adjust state on prop change").
  const [seen, setSeen] = useState(session)
  if (seen !== session && !busy) {
    setSeen(session)
    setShared(!!session.shared)
    setBundle(session.connection)
    setConnections(session.connections ?? [])
  }

  // Only a running stack can serve a connection, so offering the panel earlier
  // would only ever produce a bundle that gets refused on arrival.
  if (session.mode !== 'full_stack' || session.status !== 'running') return null

  async function run(action: 'enable' | 'rotate' | 'disable') {
    setBusy(action)
    setError('')
    setConfirming(null)
    try {
      const r = await api.setSharing(session.id, action)
      setShared(r.shared)
      setBundle(r.connection)
      setConnections(r.connections ?? [])
      onChanged?.(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update sharing')
    } finally {
      setBusy(null)
    }
  }

  const bundleText = bundle ? JSON.stringify(bundle, null, 2) : ''

  return (
    <div className="p-card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <h3 className="card-title">Share this stack</h3>
        <p className="card-desc">
          Anyone you send the bundle to can point a VTA-only agent at this stack's mediator and
          DID hosting. They paste it when they create their agent.
        </p>
      </div>

      <div className="card-content p-col gap-12" style={{ paddingTop: 14 }}>
        <div className="p-row between center" style={{ gap: 12 }}>
          <div className="p-col" style={{ minWidth: 0 }}>
            <span className="text-sm" style={{ fontWeight: 600 }}>
              {shared ? 'Sharing is on' : 'Sharing is off'}
            </span>
            <span className="field-hint" style={{ marginTop: 2 }}>
              {shared
                ? 'Anyone with the current bundle can connect a new agent.'
                : 'No one new can connect. Turn it on to get a bundle you can send.'}
            </span>
          </div>
          <div className="p-row gap-8" style={{ flexShrink: 0 }}>
            {shared && (
              <button
                className="btn btn-outline btn-sm"
                disabled={!!busy}
                onClick={() => setConfirming('rotate')}
              >
                {busy === 'rotate' ? 'Working…' : 'New code'}
              </button>
            )}
            <button
              className={shared ? 'btn btn-outline btn-sm' : 'btn btn-sm'}
              disabled={!!busy}
              onClick={() => (shared ? setConfirming('disable') : run('enable'))}
            >
              {busy === 'enable' || busy === 'disable'
                ? 'Working…'
                : shared ? 'Turn off' : 'Turn on sharing'}
            </button>
          </div>
        </div>

        {/* Both confirms repeat the same distinction, because it is the one
            people get wrong: the code controls who may join, not who is
            already in. */}
        {confirming && (
          <div className="p-alert alert-warning">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>
            <div className="grow">
              <p className="alert-title">{confirming === 'rotate' ? 'Issue a new code?' : 'Turn sharing off?'}</p>
              <p className="alert-desc">
                {confirming === 'rotate'
                  ? 'The bundle you have already shared stops working. Agents already connected keep running.'
                  : 'No one new can connect. Agents already connected keep running — you cannot remove one; deleting this stack is what stops everyone.'}
              </p>
              <div className="p-row gap-8" style={{ marginTop: 10 }}>
                <button className="btn btn-sm" onClick={() => run(confirming)}>
                  {confirming === 'rotate' ? 'Issue new code' : 'Turn off'}
                </button>
                <button className="btn btn-outline btn-sm" onClick={() => setConfirming(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm" style={{ color: 'hsl(var(--destructive))', margin: 0 }}>{error}</p>
        )}

        {shared && bundle && (
          <>
            <div className="p-col gap-8">
              <span className="p-muted text-xs" style={{ letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
                Connection bundle
              </span>
              <pre
                className="p-mono"
                style={{
                  margin: 0, padding: 12, fontSize: 11, lineHeight: 1.5,
                  background: 'hsl(var(--muted)/.4)', borderRadius: 8,
                  overflowX: 'auto', whiteSpace: 'pre', color: 'hsl(var(--foreground))',
                }}
              >{bundleText}</pre>
              <button
                className="btn btn-outline btn-sm"
                style={{ alignSelf: 'flex-start', gap: 6 }}
                onClick={() => copy('share-bundle', bundleText)}
              >
                <CopyIcon copied={copiedKey === 'share-bundle'} />
                {copiedKey === 'share-bundle' ? 'Copied!' : 'Copy bundle'}
              </button>
            </div>

            {/* The same values individually, for configuring by hand. The code
                is short enough to read over a phone call, which is why the
                format has a check character. */}
            <Row label="Share code" value={bundle.code} copyKey="share-code" copiedKey={copiedKey} onCopy={copy} />
            <Row label="Mediator DID" value={bundle.mediator_did} copyKey="share-mediator" copiedKey={copiedKey} onCopy={copy} />
            <Row label="DID host" value={bundle.did_hosting_server_url} copyKey="share-dids" copiedKey={copiedKey} onCopy={copy} />
          </>
        )}

        <ConnectedAgents connections={connections} />

        <p className="field-hint" style={{ margin: 0 }}>
          <strong>Before you share:</strong> connected agents store their DIDs on your DID host and
          route their messages through your mediator. Once someone is connected you cannot remove
          them individually — you can stop new ones with a new code, or delete the stack, which
          stops everyone.
        </p>
      </div>
    </div>
  )
}

/**
 * Other people's agents connected to this stack.
 *
 * Read-only: there is no per-connection action because there is no
 * per-connection API. The list exists because deleting this stack is allowed
 * and breaks every agent on it, so the owner has to be able to see that from
 * the page where Delete lives.
 */
export function ConnectedAgents({ connections }: { connections?: StackConnectionSummary[] }) {
  if (!connections || connections.length === 0) return null
  return (
    <div className="p-col gap-8">
      <span className="p-muted text-xs" style={{ letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
        Connected agents · {connections.length}
      </span>
      <div className="p-col gap-4">
        {connections.map(c => (
          <div key={c.vta_name} className="p-row between center" style={{ gap: 12 }}>
            <span className="p-mono text-xs" style={{ wordBreak: 'break-all' }}>{c.vta_name}</span>
            {statusBadge(c.status)}
          </div>
        ))}
      </div>
      <span className="field-hint">Deleting this stack will stop these agents working.</span>
    </div>
  )
}
