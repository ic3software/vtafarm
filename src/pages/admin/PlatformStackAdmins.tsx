import { useState, useEffect, useCallback } from 'react'
import { api, type PlatformStackAdmins as AdminsData, type VtaAdminGrant } from '@/lib/api'
import { isValidAdminDid } from '../portal/portalUtils'

// Co-admins on the platform stack's VTA.
// Design: vtafarm-api/docs/platform-stack-admin-grant-design.md §8.
//
// Self-service: a second admin pastes the did:key their own `pnm setup` minted
// rather than asking whoever holds the credential to run `pnm acl create` for
// them. Adding only — removal is `pnm acl delete` at a terminal, and this page
// says so rather than pretending the button is missing.
//
// Shows what was added from here, and nothing else. It is deliberately not a
// view of the VTA's admin list: reading that costs a minute of downtime, any
// copy is stale as soon as a co-admin rotates their key, and `pnm acl list`
// answers the live question for free. The page points at that instead.

function shortDid(did: string) {
  return did.length > 28 ? `${did.slice(0, 18)}…${did.slice(-6)}` : did
}

function formatWhen(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString()
}

const GRANT_BADGE: Record<VtaAdminGrant['status'], { cls: string; text: string }> = {
  granted: { cls: 'badge-success', text: 'granted' },
  pending: { cls: 'badge-warning', text: 'in progress' },
  failed: { cls: 'badge-destructive', text: 'failed' },
}

export function PlatformStackAdmins({ stackLabel }: { stackLabel: string }) {
  const [data, setData] = useState<AdminsData | null>(null)
  const [loadError, setLoadError] = useState('')

  const [did, setDid] = useState('')
  const [label, setLabel] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [warning, setWarning] = useState('')

  const load = useCallback(() => (
    api.getPlatformStackAdmins()
      .then(d => { setData(d); setLoadError('') })
      .catch(err => setLoadError(err instanceof Error ? err.message : 'Failed to load admins'))
  ), [])

  useEffect(() => { void load() }, [load])

  async function handleGrant() {
    const trimmedDid = did.trim()
    const trimmedLabel = label.trim()

    if (!isValidAdminDid(trimmedDid)) {
      setError('Paste only the did:key value (e.g. did:key:z6Mk…) — no surrounding text, labels, quotes or whitespace.')
      return
    }
    if (!trimmedLabel) {
      setError('Add a name. After this key rotates, the label is the only thing left that says who it belongs to.')
      return
    }
    if (confirm.trim() !== stackLabel) {
      setError(`Type ${stackLabel} to confirm — this stops the VTA for about a minute.`)
      return
    }

    setError(''); setNotice(''); setWarning(''); setBusy(true)
    try {
      const res = await api.grantPlatformStackAdmin({
        did: trimmedDid, label: trimmedLabel, confirm: confirm.trim(),
      })
      setNotice(res.already_present
        ? `${trimmedLabel} was already an admin — nothing changed.`
        : `${trimmedLabel} can now administer the platform stack.`)
      // Reported separately from the error path: the grant landed either way,
      // and conflating the two would send someone looking for damage that isn't
      // there — or, worse, hide a stack that never came back up.
      if (res.warning) setWarning(res.warning)
      setDid(''); setLabel(''); setConfirm('')
      await load()
    } catch (err) {
      const status = (err as { status?: number }).status
      const msg = err instanceof Error ? err.message : 'Failed to add the admin'
      // 409 means "this DID already has a grant" or "another admin holds the
      // window". Neither is damage, and the fields are deliberately left filled
      // in — retrying is one click, not a re-type.
      setError(status === 409 ? `${msg} Nothing was changed.` : msg)
    } finally {
      setBusy(false)
    }
  }

  const grants = data?.grants ?? []

  return (
    <div className="p-card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <h3 className="card-title">Administrators</h3>
        <p className="card-desc">
          Full admin on this VTA — signing, the vault, and adding or removing other admins.
        </p>
      </div>

      <div className="card-content p-col gap-16">
        {loadError && (
          <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{loadError}</p>
        )}

        {/* ── Add ──────────────────────────────────────────────────────────── */}
        <div className="p-col gap-12">
          <div>
            <label className="p-label" htmlFor="psa-did">Their DID <span className="req">*</span></label>
            <input className="p-input p-mono" id="psa-did" type="text" placeholder="did:key:z6Mk…"
              value={did} onChange={e => setDid(e.target.value)} disabled={busy} />
            <div className="field-hint">
              From their own <span className="p-mono">pnm setup --name &lt;name&gt;</span>.
            </div>
          </div>

          <div>
            <label className="p-label" htmlFor="psa-label">Who is this? <span className="req">*</span></label>
            <input className="p-input" id="psa-label" type="text" placeholder="alice"
              maxLength={64} value={label} onChange={e => setLabel(e.target.value)} disabled={busy} />
            <div className="field-hint">
              Their DID changes when they first connect; this label doesn't.
            </div>
          </div>

          <div>
            <label className="p-label" htmlFor="psa-confirm">
              Type <span className="p-mono">{stackLabel}</span> to confirm <span className="req">*</span>
            </label>
            <input className="p-input p-mono" id="psa-confirm" type="text" placeholder={stackLabel}
              value={confirm} onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !busy && handleGrant()} disabled={busy} />
            <div className="field-hint">
              Restarts the VTA — offline for about a minute.
            </div>
          </div>

          {error && <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{error}</p>}
          {notice && <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--foreground))' }}>{notice}</p>}
          {warning && (
            <div className="p-alert alert-warning">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
              <div className="grow">
                <p className="alert-title">The VTA did not come back up</p>
                <p className="alert-desc">{warning}</p>
              </div>
            </div>
          )}

          <div className="p-row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-default" onClick={handleGrant}
              disabled={busy || !did.trim() || !label.trim() || !confirm.trim()}>
              {busy ? 'Adding — VTA restarting…' : <>Add administrator <span className="arrow">→</span></>}
            </button>
          </div>
        </div>

        {/* ── What was added from here ─────────────────────────────────────── */}
        <GrantHistory grants={grants} />
      </div>
    </div>
  )
}

function GrantHistory({ grants }: { grants: VtaAdminGrant[] }) {
  return (
    <div className="p-col gap-8">
      <span className="p-muted text-xs" style={{ letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
        Added from here
      </span>
      {grants.length === 0 && (
        <p className="p-muted text-sm" style={{ margin: 0 }}>
          Nothing yet. The first administrator was set during provisioning.
        </p>
      )}
      <div className="p-col gap-8">
        {grants.map(g => {
          const badge = GRANT_BADGE[g.status]
          return (
            <div key={`${g.did}-${g.created_at}`} className="p-row between center" style={{ gap: 12 }}>
              <div className="p-col" style={{ minWidth: 0, gap: 2 }}>
                <span style={{ fontSize: 13 }}>{g.label || <span className="p-muted">unlabelled</span>}</span>
                <span className="p-mono p-muted" style={{ fontSize: 11 }} title={g.did}>
                  {shortDid(g.did)}
                </span>
                {g.status === 'failed' && g.error_msg && (
                  <span style={{ fontSize: 11, color: 'hsl(var(--destructive))' }}>{g.error_msg}</span>
                )}
              </div>
              <div className="p-row center" style={{ gap: 8, flexShrink: 0 }}>
                <span className="p-muted text-xs">{formatWhen(g.granted_at ?? g.created_at)}</span>
                <span className={`p-badge ${badge.cls}`}>{badge.text}</span>
              </div>
            </div>
          )
        })}
      </div>
      {/* Kept because both are load-bearing: these DIDs stop matching the VTA
          after first connect, and removal only happens at a pnm prompt. */}
      <p className="field-hint" style={{ marginTop: 4 }}>
        DIDs as submitted — they change after first connect. For the live list and to remove
        someone: <span className="p-mono">pnm acl list</span> /{' '}
        <span className="p-mono">pnm acl delete &lt;did&gt;</span>.
      </p>
    </div>
  )
}
