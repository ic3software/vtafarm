import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type Domain, type DnsRecordStatus, type TxtRecordStatus } from '@/lib/api'
import { useCopyState } from './portalUtils'

// A domain the user owns, verified here on its own — before any session exists.
//
// The split is the whole point: by the time a session is created its hostnames
// already resolve, so it provisions immediately instead of parking half-built
// while somebody edits DNS in another window.
//
// A user may hold at most one custom domain, so this is a single card rather
// than a list — no pagination, no bulk actions, no empty-list scaffolding.

/** The API refuses a second check inside this window with a 429, so the button
 *  counts down rather than offering a press that can only fail. Keep in step
 *  with handler.VerifyCooldown on the server — that one is the actual rule. */
const COOLDOWN_MS = 60_000

/** "just now" / "3 minutes ago" — a clock time tells nobody whether the check
 *  they are looking at is the one they just ran. */
function relativeTime(fromMs: number, nowMs: number): string {
  const secs = Math.max(0, Math.round((nowMs - fromMs) / 1000))
  if (secs < 10) return 'just now'
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function CopyButton({ value, copyKey, copiedKey, onCopy }: {
  value: string
  copyKey: string
  copiedKey: string | null
  onCopy: (key: string, value: string) => void
}) {
  const copied = copiedKey === copyKey
  return (
    <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0, gap: 6, height: 24, padding: '0 8px' }}
      onClick={() => onCopy(copyKey, value)} aria-label={`Copy ${value}`}>
      {copied
        ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width: 12, height: 12 }}><path d="M20 6 9 17l-5-5"/></svg>
        : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 12, height: 12 }}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ✓ passing, ✗ failing, nothing at all before the user has pressed Verify. A
// domain the user just attached has no records to find, and neither a red cross
// nor a placeholder belongs there — there is no result to report yet.
function StatusGlyph({ ok, checked }: { ok: boolean; checked: boolean }) {
  if (!checked) return null
  return ok
    ? <svg viewBox="0 0 24 24" fill="none" stroke="hsl(var(--success))" strokeWidth={3} style={{ width: 15, height: 15, flexShrink: 0 }}><title>Resolving correctly</title><path d="M20 6 9 17l-5-5"/></svg>
    : <svg viewBox="0 0 24 24" fill="none" stroke="hsl(var(--destructive))" strokeWidth={2.5} style={{ width: 15, height: 15, flexShrink: 0 }}><title>Not resolving yet</title><path d="M18 6 6 18M6 6l12 12"/></svg>
}

function RecordRow({ type, name, value, ok, checked, detail, copyKey, copiedKey, onCopy }: {
  type: string
  name: string
  value: string
  ok: boolean
  checked: boolean
  detail?: string
  copyKey: string
  copiedKey: string | null
  onCopy: (key: string, value: string) => void
}) {
  return (
    <div className="p-card" style={{ background: 'hsl(var(--muted)/.4)', border: 'none' }}>
      <div className="card-content" style={{ padding: '10px 14px' }}>
        <div className="p-row" style={{ gap: 10, alignItems: 'center' }}>
          <span className="p-badge badge-secondary" style={{ flexShrink: 0, fontFamily: 'var(--mono)' }}>{type}</span>
          <div className="p-col grow" style={{ minWidth: 0, gap: 4 }}>
            <div className="p-row" style={{ gap: 8, alignItems: 'center' }}>
              <span className="p-mono grow" style={{ fontSize: 12, wordBreak: 'break-all', minWidth: 0 }}>{name}</span>
              <CopyButton value={name} copyKey={`${copyKey}-name`} copiedKey={copiedKey} onCopy={onCopy} />
            </div>
            <div className="p-row" style={{ gap: 8, alignItems: 'center' }}>
              <span className="p-mono grow p-muted" style={{ fontSize: 12, wordBreak: 'break-all', minWidth: 0 }}>{value}</span>
              <CopyButton value={value} copyKey={`${copyKey}-value`} copiedKey={copiedKey} onCopy={onCopy} />
            </div>
          </div>
          <StatusGlyph ok={ok} checked={checked} />
        </div>
        {/* Straight from the API. The UI never composes DNS advice of its own —
            one source of truth, and it improves as the checker does. */}
        {checked && !ok && detail && (
          <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'hsl(var(--destructive))' }}>{detail}</p>
        )}
      </div>
    </div>
  )
}

function componentLabel(c: DnsRecordStatus['component']) {
  return c === 'dids' ? 'DID hosting' : c === 'vtc' ? 'VTC' : c === 'vta' ? 'VTA' : 'Mediator'
}

export function DomainsView() {
  const navigate = useNavigate()
  const { copiedKey, copy } = useCopyState()

  const [domain, setDomain] = useState<Domain | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [attachOpen, setAttachOpen] = useState(false)
  const [attachInput, setAttachInput] = useState('')
  const [attaching, setAttaching] = useState(false)
  const [attachError, setAttachError] = useState('')

  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState('')
  // A ticking clock, so the countdown and the "last checked" label stay honest
  // while the user just sits there.
  const [nowMs, setNowMs] = useState(() => Date.now())

  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [removedNotice, setRemovedNotice] = useState('')

  const load = useCallback(() => (
    api.listDomains()
      .then(list => setDomain(list[0] ?? null))
      .catch(err => setLoadError(err instanceof Error ? err.message : 'Failed to load domains'))
      .finally(() => setLoading(false))
  ), [])

  useEffect(() => { void load() }, [load])

  // No background re-check. DNS is resolved only when the user presses Verify
  // DNS: every lookup is real work against public resolvers, and a page that
  // quietly re-checks would keep announcing "not verified yet" at someone who
  // is still in the middle of editing their zone.

  const lastCheckedMs = domain?.last_checked_at ? new Date(domain.last_checked_at).getTime() : null
  const cooldownLeft = lastCheckedMs === null ? 0 : Math.max(0, COOLDOWN_MS - (nowMs - lastCheckedMs))
  const cooling = cooldownLeft > 0

  // One second while the countdown is running, then slow to a tick that only
  // has to keep "3 minutes ago" from going stale. Nothing to run at all once
  // verified — that label is a fixed date.
  useEffect(() => {
    if (lastCheckedMs === null || domain?.verified) return
    const iv = setInterval(() => setNowMs(Date.now()), cooling ? 1_000 : 30_000)
    return () => clearInterval(iv)
  }, [lastCheckedMs, cooling, domain?.verified])

  async function handleAttach() {
    const value = normalizeInput(attachInput)
    if (!value) { setAttachError('Enter a domain'); return }
    setAttaching(true)
    setAttachError('')
    try {
      const d = await api.attachDomain(value)
      setDomain(d)
      setAttachOpen(false)
      setAttachInput('')
      setRemovedNotice('')
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : 'Failed to attach domain')
    } finally {
      setAttaching(false)
    }
  }

  async function handleVerify() {
    if (!domain) return
    setVerifying(true)
    setVerifyError('')
    try {
      const d = await api.verifyDomain(domain.id)
      setDomain(d)
      setNowMs(Date.now())
    } catch (err) {
      // A failing check is a 200 with per-record detail, so reaching here means
      // the request itself failed — including the 429 the server answers if a
      // press somehow outran the countdown. Say so rather than looking idle.
      setVerifyError(err instanceof Error ? err.message : 'Verification request failed')
    } finally {
      setVerifying(false)
    }
  }

  async function handleRemove() {
    if (!domain) return
    setRemoving(true)
    setRemoveError('')
    try {
      await api.deleteDomain(domain.id)
      // The only moment the user will think about their leftover records, and
      // one pointing at our ingress is a dangling-DNS liability.
      setRemovedNotice(domain.domain)
      setDomain(null)
      setConfirmRemove(false)
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'Failed to remove domain')
    } finally {
      setRemoving(false)
    }
  }

  const head = (
    <div className="page-head">
      <div>
        <h1>Domains</h1>
        <p className="sub">
          Run a Full Stack agent under a domain you own, instead of a generated name in ours.
        </p>
      </div>
    </div>
  )

  if (loading) {
    return (
      <section className="p-content">
        {head}
        <div className="p-card"><div className="card-content"><p className="p-muted text-sm" style={{ margin: 0 }}>Loading…</p></div></div>
      </section>
    )
  }

  if (loadError) {
    return (
      <section className="p-content">
        {head}
        <div className="p-card">
          <div className="card-content">
            <div className="p-alert alert-destructive" style={{ margin: 0 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12"/></svg>
              <div className="grow">
                <p className="alert-title">Couldn't load your domains</p>
                <p className="alert-desc">{loadError}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="p-content">
      {head}

      {/* Directly under the page's own description, not down in the card: this
          is the answer to "it's verified, now what?", and the next thing the
          user does about it happens on another page entirely. */}
      {domain?.verified && !domain.in_use_by && (
        <div className="p-alert alert-success" style={{ marginBottom: 16 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M20 6 9 17l-5-5"/></svg>
          <div className="grow">
            <p className="alert-title">Ready to use</p>
            <p className="alert-desc">
              Pick it under <strong>Domain</strong> when you create a Full Stack agent.
              You can delete the TXT record now — it's only checked at verification.
            </p>
          </div>
        </div>
      )}

      {removedNotice && (
        <div className="p-alert alert-warning" style={{ marginBottom: 16 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
          <div className="grow">
            <p className="alert-title">Remove the records at your DNS provider</p>
            <p className="alert-desc">
              <span className="p-mono">{removedNotice}</span> is detached here, but its four
              CNAME records still point at VTA Farm. Delete them at your provider — a record
              left pointing at a service you no longer use is a security risk.
            </p>
          </div>
        </div>
      )}

      {!domain ? (
        <div className="p-card">
          <div className="card-header">
            <h3 className="card-title">Attach a domain</h3>
            <p className="card-desc">
              Your agent, community, mediator and DID hosting get fixed hostnames under a
              domain you own — <span className="p-mono">vta.</span>,{' '}
              <span className="p-mono">vtc.</span>, <span className="p-mono">mediator.</span> and{' '}
              <span className="p-mono">dids.</span> You create five DNS records; we check them
              and never touch your zone.
            </p>
          </div>
          <div className="card-footer between">
            <span className="field-hint" style={{ marginTop: 0 }}>One domain per account.</span>
            <button className="btn btn-default" onClick={() => { setAttachOpen(true); setAttachError('') }}>
              Attach a domain <span className="arrow">→</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="p-card">
          <div className="card-header with-action">
            <div>
              <h3 className="card-title p-mono">{domain.domain}</h3>
              <p className="card-desc">
                {domain.verified
                  ? domain.in_use_by
                    ? 'In use by one of your agents.'
                    : 'Verified. Select it when you create a Full Stack agent.'
                  : 'Create these five records at your DNS provider, then check them.'}
              </p>
            </div>
            <span className={`p-badge ${domain.verified ? 'badge-success' : 'badge-warning'}`}>
              {domain.verified ? 'verified' : 'pending'}
            </span>
          </div>

          <div className="card-content p-col gap-12">
            {domain.verified ? (
              <>
                <div className="p-col gap-12">
                  {domain.records.map(r => (
                    <div key={r.component} className="p-row between" style={{ gap: 16, alignItems: 'flex-start' }}>
                      <span className="p-muted text-sm" style={{ flexShrink: 0 }}>{componentLabel(r.component)}</span>
                      <span className="p-mono text-xs" style={{ textAlign: 'right', overflowWrap: 'anywhere', minWidth: 0 }}>
                        {r.fqdn}
                      </span>
                    </div>
                  ))}
                </div>
                {domain.in_use_by ? (
                  <div className="p-alert alert-info">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                    <div className="grow">
                      <p className="alert-title">In use</p>
                      <p className="alert-desc">
                        <button className="btn btn-ghost btn-sm" style={{ padding: 0, height: 'auto' }}
                          onClick={() => navigate(`/portal/session/${domain.in_use_by}`)}>
                          Open the agent running on it
                        </button>
                        {' '}— a domain backs one agent at a time, because its hostnames are fixed.
                      </p>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                {domain.checked && (
                  <div className="p-alert alert-warning">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
                    <div className="grow">
                      <p className="alert-title">Not verified yet</p>
                      <p className="alert-desc">
                        Some records aren't resolving as expected. This is normal right after
                        editing DNS — see each record below.
                      </p>
                    </div>
                  </div>
                )}

                {domain.txt && <TxtRow txt={domain.txt} checked={domain.checked} copiedKey={copiedKey} onCopy={copy} />}
                {domain.records.map(r => (
                  <RecordRow key={r.component}
                    type="CNAME"
                    name={r.fqdn}
                    value={r.expected_value}
                    ok={r.ok}
                    checked={domain.checked}
                    detail={r.detail}
                    copyKey={`rec-${r.component}`}
                    copiedKey={copiedKey}
                    onCopy={copy} />
                ))}

                <div className="p-alert alert-info">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                  <div className="grow">
                    <p className="alert-title">Before you check</p>
                    {/* No markers and no indent, so each item starts flush with
                        the title above it. A bullet would have to either push
                        the text right of "Before" or hang out into the alert's
                        icon gutter; the gap carries the separation instead. */}
                    <ul className="alert-desc" style={{ margin: '4px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
                      <li>Create these at your DNS provider (your registrar, Cloudflare, Route 53…), not here.</li>
                      <li>
                        <strong>If your domain is on Cloudflare, all four CNAMEs must be
                        DNS&nbsp;only (grey cloud)</strong> — a proxied record is answered by
                        your zone and never reaches us.
                      </li>
                      <li>You can delete the TXT record once verification succeeds. It's checked then and never again.</li>
                      <li>
                        New records usually resolve within minutes. A name checked <em>before</em>{' '}
                        it existed can take up to an hour to clear from public resolvers.
                      </li>
                    </ul>
                  </div>
                </div>

                {verifyError && <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{verifyError}</p>}
                {removeError && <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{removeError}</p>}
              </>
            )}
          </div>

          <div className="card-footer between">
            <span className="field-hint" style={{ marginTop: 0 }}>
              {domain.verified
                ? `Verified${domain.verified_at ? ` ${new Date(domain.verified_at).toLocaleDateString()}` : ''}`
                : lastCheckedMs === null
                  ? 'Not checked yet'
                  : `Last checked ${relativeTime(lastCheckedMs, nowMs)}`}
            </span>
            <div className="p-row gap-12">
              <button className="btn btn-ghost" style={{ color: 'hsl(var(--destructive))' }}
                onClick={() => { setConfirmRemove(true); setRemoveError('') }}>
                Remove domain
              </button>
              {!domain.verified && (
                // Disabled *and* counting down: "Verify in 41s" says when to
                // come back, where a greyed button with no number reads as
                // broken. The server enforces the same minute regardless.
                <button className="btn btn-default" onClick={handleVerify} disabled={verifying || cooling}
                  title={cooling ? 'DNS was just checked — a second check this soon would return the same answer' : undefined}>
                  {verifying ? 'Verifying…' : cooling ? `Verify in ${Math.ceil(cooldownLeft / 1000)}s` : 'Verify DNS'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {attachOpen && (
        <div className="p-overlay">
          <div className="p-dialog">
            <div className="dialog-header">
              <h3 className="dialog-title">Attach a domain</h3>
              <p className="dialog-desc">
                Enter the domain itself — <span className="p-mono">aaa.com</span> — not one of
                the hostnames we'll create under it. We'll show you the records to create.
              </p>
            </div>
            <div className="dialog-body">
              <div>
                <label className="p-label" htmlFor="dv-domain">Domain</label>
                <input className="p-input p-mono" id="dv-domain" autoFocus placeholder="aaa.com"
                  value={attachInput}
                  onChange={e => setAttachInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAttach()} />
                <div className="field-hint">
                  You'll need to be able to create DNS records for it.
                </div>
              </div>
              {attachError && <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{attachError}</p>}
            </div>
            <div className="dialog-footer">
              <button className="btn btn-ghost" onClick={() => setAttachOpen(false)} disabled={attaching}>Cancel</button>
              <button className="btn btn-default" onClick={handleAttach} disabled={attaching || !attachInput.trim()}>
                {attaching ? 'Attaching…' : 'Attach'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmRemove && domain && (
        <div className="p-overlay">
          <div className="p-dialog">
            <div className="dialog-header">
              <h3 className="dialog-title">Remove this domain?</h3>
              <p className="dialog-desc">
                <span className="p-mono">{domain.domain}</span> is detached from your account.
                Nothing at your DNS provider changes — you'll want to delete the records
                yourself afterwards.
                {domain.verified && ' Re-attaching later issues a new verification token, so you would verify it again.'}
              </p>
            </div>
            {removeError && (
              <div className="dialog-body">
                <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{removeError}</p>
              </div>
            )}
            <div className="dialog-footer">
              <button className="btn btn-ghost" onClick={() => setConfirmRemove(false)} disabled={removing}>Cancel</button>
              <button className="btn btn-destructive" onClick={handleRemove} disabled={removing}>
                {removing ? 'Removing…' : 'Remove domain'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function TxtRow({ txt, checked, copiedKey, onCopy }: {
  txt: TxtRecordStatus
  checked: boolean
  copiedKey: string | null
  onCopy: (key: string, value: string) => void
}) {
  return (
    <RecordRow type="TXT" name={txt.name} value={txt.expected} ok={txt.ok} checked={checked}
      detail={txt.detail} copyKey="rec-txt" copiedKey={copiedKey} onCopy={onCopy} />
  )
}

// Mirrors what the API does with the value anyway; doing it here means the
// field shows what will actually be stored while the user is still typing.
function normalizeInput(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/^\.+|\.+$/g, '')
}
