import { useState } from 'react'
import { api, type SetupSession, type SetupSessionUrls, type SetupSessionCollected } from '@/lib/api'
import { useCopyState } from './portalUtils'

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

// Single-use DID-hosting admin enrollment link — shown at the top of the completed/running page.
export function DidsEnrollAlert({ session }: { session: SetupSession }) {
  const [enrollUrl, setEnrollUrl] = useState(session.action_required?.dids_admin_enroll_url ?? '')
  const [reissuing, setReissuing] = useState(false)
  const [reissueError, setReissueError] = useState('')

  if (!enrollUrl) return null

  async function handleReissue() {
    setReissuing(true)
    setReissueError('')
    try {
      const r = await api.reissueDidsEnroll(session.id)
      setEnrollUrl(r.dids_admin_enroll_url)
    } catch (err) {
      setReissueError(err instanceof Error ? err.message : 'Failed to reissue enrollment link')
    } finally {
      setReissuing(false)
    }
  }

  return (
    <div className="p-alert alert-warning" style={{ marginBottom: 16 }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>
      <div className="grow">
        <p className="alert-title">DID hosting admin enrollment</p>
        <p className="alert-desc">
          Visit this single-use link to register a passkey for the DID hosting admin panel.
          {reissueError && <span style={{ color: 'hsl(var(--destructive))', display: 'block', marginTop: 4 }}>{reissueError}</span>}
        </p>
      </div>
      <div className="p-row gap-8" style={{ flexShrink: 0 }}>
        <a className="btn btn-outline btn-sm" href={enrollUrl} target="_blank" rel="noopener">Open enrollment →</a>
        <button className="btn btn-ghost btn-sm" onClick={handleReissue} disabled={reissuing}>
          {reissuing ? 'Reissuing…' : 'Reissue link'}
        </button>
      </div>
    </div>
  )
}

// Collected DIDs — shown at the top of the completed/running page, below DidsEnrollAlert.
export function CollectedDidsCard({ collected }: { collected?: SetupSessionCollected }) {
  const { copiedKey, copy } = useCopyState()
  if (!collected || !(collected.vta_did || collected.mediator_did || collected.did_hosting_did || collected.mediator_admin_did || collected.did_hosting_admin_did)) {
    return null
  }
  return (
    <div className="p-card" style={{ marginBottom: 16 }}>
      <div className="card-header"><h3 className="card-title">Collected DIDs</h3></div>
      <div className="card-content p-col gap-12" style={{ paddingTop: 14 }}>
        {collected.vta_did && (
          <Row label="VTA DID" value={collected.vta_did} hint="Feed this to `pnm setup continue --vta-did`." copyKey="did-vta" copiedKey={copiedKey} onCopy={copy} />
        )}
        {collected.mediator_did && (
          <Row label="Mediator DID" value={collected.mediator_did} copyKey="did-mediator" copiedKey={copiedKey} onCopy={copy} />
        )}
        {collected.did_hosting_did && (
          <Row label="DID hosting daemon DID" value={collected.did_hosting_did} copyKey="did-daemon" copiedKey={copiedKey} onCopy={copy} />
        )}
        {collected.mediator_admin_did && (
          <Row label="Mediator admin DID" value={collected.mediator_admin_did} copyKey="did-mediator-admin" copiedKey={copiedKey} onCopy={copy} />
        )}
        {collected.did_hosting_admin_did && (
          <Row label="DID hosting admin DID" value={collected.did_hosting_admin_did} copyKey="did-hosting-admin" copiedKey={copiedKey} onCopy={copy} />
        )}
      </div>
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
      <div className="p-row between"><span className="p-muted text-sm">VTA</span><a href={urls.vta} target="_blank" rel="noopener" className="p-mono text-xs" style={{ color: 'hsl(var(--primary))' }}>{urls.vta}</a></div>
      <hr className="p-sep"/>
      <div className="p-row between"><span className="p-muted text-sm">Mediator</span><a href={urls.mediator} target="_blank" rel="noopener" className="p-mono text-xs" style={{ color: 'hsl(var(--primary))' }}>{urls.mediator}</a></div>
      <hr className="p-sep"/>
      <div className="p-row between"><span className="p-muted text-sm">DID Hosting</span><a href={urls.dids} target="_blank" rel="noopener" className="p-mono text-xs" style={{ color: 'hsl(var(--primary))' }}>{urls.dids}</a></div>
    </>
  )
}

// Reveal-once admin private keys — not actually cleared server-side after first
// view, so this is a hide-by-default toggle rather than a one-shot modal.
export function AdminKeysCard({ session }: { session: SetupSession }) {
  const { copiedKey, copy } = useCopyState()
  const hasKeys = !!(session.mediator_admin_key || session.webvh_admin_key)
  if (!hasKeys) return null
  return (
    <div className="p-card" style={{ borderColor: 'hsl(var(--warning)/.4)' }}>
      <div className="card-header">
        <h3 className="card-title">Admin private keys</h3>
        <p className="card-desc">
          Save these somewhere safe (e.g. a password manager) for offline backup. They stay visible
          here until you delete this agent, so remove them from view once you've saved them.
        </p>
      </div>
      <div className="card-content p-col gap-12" style={{ paddingTop: 14 }}>
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
