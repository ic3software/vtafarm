import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { api, type SetupSession, API_BASE } from '@/lib/api'
import { statusBadge, FULL_STACK_PHASES, VTA_ONLY_PHASES, phaseIndex, isValidAdminDid, domainTypeBadge } from './portalUtils'
import { PhaseStepper } from './PhaseStepper'
import { DidsEnrollAlert, DidsEnrollConfigRow, VtcInstallAlert, VtcInstallConfigRow, CollectedDidsCard, EndpointConfigRows, AdminKeysCard, ConfigLinkRow, ShareStackCard, ConnectedToCard } from './FullStackOutputs'
import { useDidsEnroll, useVtcInstall } from './fullStackHooks'
import { SessionVersionsCard } from './SessionVersionsCard'
import type { PortalContext } from './Portal'

const STATUS_STEPS: Array<{ label: string; sub: string; status: SetupSession['status'] | null }> = [
  { label: 'Create session',     sub: 'created',            status: null },
  { label: 'DNS & environment',  sub: 'dns_provisioned',    status: 'dns_provisioned' },
  { label: 'VTA setup',          sub: 'vta_setup_running',  status: 'vta_setup_running' },
  { label: 'Admin DID',          sub: 'vta_setup_complete', status: 'vta_setup_complete' },
  { label: 'Deploy VTA',         sub: 'provisioning',       status: 'provisioning' },
  { label: 'Running',            sub: 'running',            status: 'running' },
]

const ORDER = STATUS_STEPS.map(s => s.status)

export function SessionDetailView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { loadSessions } = useOutletContext<PortalContext>()
  const sessionId = id!

  const [session, setSession] = useState<SetupSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<string[]>([])
  const consoleBodyRef = useRef<HTMLDivElement>(null)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [copiedVta, setCopiedVta] = useState(false)

  // Provision form (shown when status === 'vta_setup_complete')
  const [adminDid, setAdminDid] = useState('')
  const [provisioning, setProvisioning] = useState(false)
  const [provisionError, setProvisionError] = useState('')

  const didsEnroll = useDidsEnroll(session)
  const vtcInstall = useVtcInstall(session?.mode === 'full_stack' ? session : null)

  function copyVtaDid(did: string) {
    navigator.clipboard.writeText(did).catch(() => {})
    setCopiedVta(true)
    setTimeout(() => setCopiedVta(false), 2000)
  }

  function stepClass(stepStatus: SetupSession['status'] | null) {
    if (!session) return ''
    if (session.status === 'running') return 'done'
    if (stepStatus === null) return 'done'
    if (session.status === 'failed') {
      // 'failed' is not in ORDER so we can't know the exact step — mark last step as failed, rest done
      return stepStatus === 'running' ? 'failed' : 'done'
    }
    const cur = ORDER.indexOf(session.status)
    const idx = ORDER.indexOf(stepStatus)
    if (idx < cur) return 'done'
    if (idx === cur) return 'active'
    return ''
  }

  useEffect(() => {
    api.getSession(sessionId).then(setSession).catch(() => {}).finally(() => setLoading(false))
  }, [sessionId])

  // Poll every 3 s until complete or failed
  useEffect(() => {
    if (!session || ['complete', 'failed'].includes(session.status)) return
    const iv = setInterval(() => {
      api.getSession(sessionId).then(s => {
        setSession(s)
        if (['complete', 'failed'].includes(s.status)) clearInterval(iv)
      }).catch(() => {})
    }, 3000)
    return () => clearInterval(iv)
    // Keyed on the status, not the object: this effect's own poll replaces
    // `session` every tick, so depending on it would rebuild the interval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, session?.status])

  useEffect(() => {
    if (!session) return
    const skip = ['dns_provisioned', 'vta_setup_complete', 'dns_provision', 'awaiting_admin_did']
    if (skip.includes(session.status)) return
    const es = new EventSource(`${API_BASE}/api/v1/setup/${sessionId}/logs`, { withCredentials: true })
    es.onmessage = e => setLogs(prev => [...prev, e.data])
    es.addEventListener('done', () => es.close())
    es.onerror = () => es.close()
    return () => es.close()
    // Keyed on the status, not the object: the 3s poll replaces `session` every
    // tick, so depending on it would reconnect this stream continuously.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, session?.status])

  // Scroll only within the console body — not the whole page — as new lines arrive.
  useEffect(() => {
    const el = consoleBodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs])

  async function handleProvision() {
    const trimmed = adminDid.trim()
    if (!trimmed) { setProvisionError('Enter the admin DID from pnm'); return }
    if (!isValidAdminDid(trimmed)) {
      setProvisionError('Invalid did:key — make sure you copied only the did:key value (e.g. did:key:z6Mk…) with no surrounding text, labels, quotes, or whitespace.')
      return
    }
    setProvisionError('')
    setProvisioning(true)
    try {
      await api.provisionAdmin(sessionId, trimmed)
      // Leave `provisioning` true — this card unmounts once the polling loop
      // above picks up the status change, so there's no "done" state to
      // reset to, and resetting early would let the button look clickable
      // again during the gap before that happens.
    } catch (err) {
      setProvisionError(err instanceof Error ? err.message : 'Provisioning failed')
      setProvisioning(false)
    }
  }

  async function handleDelete() {
    if (deleteInput !== name) return
    setDeleteError('')
    setDeleting(true)
    try {
      await api.deleteSession(sessionId)
      loadSessions()
      navigate('/portal', { replace: true })
    } catch (err) {
      // Was silently swallowed: the spinner stopped, the agent was still there,
      // and nothing said why. On a confirmed destructive action that reads as
      // "it worked" until the list is refreshed.
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete the agent')
    }
    setDeleting(false)
  }

  // The route param is the agent's name — there is no opaque id any more — so
  // this stays right even before the session has loaded.
  const name = session?.vta_name ?? sessionId

  if (loading) return <section className="p-content"><p className="p-muted">Loading…</p></section>
  if (!session) return <section className="p-content"><p className="p-muted">Session not found.</p></section>

  const isFullStack = session.mode !== 'vta_only'
  const fsPhases = FULL_STACK_PHASES
  const vtaDid = isFullStack ? session.collected?.vta_did : session.vta_did
  const isAwaitingAdmin = isFullStack ? session.status === 'awaiting_admin_did' : session.status === 'vta_setup_complete'
  const adminDidStep = (isFullStack
    ? phaseIndex(fsPhases, 'awaiting_admin_did')
    : phaseIndex(VTA_ONLY_PHASES, 'vta_setup_complete')) + 1
  const fsPhaseIndex = Math.max(0, phaseIndex(fsPhases, session.status))
  const fsFailed = session.status === 'failed'
  const isFullStackCompleted = isFullStack && session.status === 'running'

  return (
    <section className="p-content">
      <div className="page-head">
        <div>
          <div className="p-row gap-12" style={{ marginBottom: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { loadSessions(); navigate('/portal') }} style={{ padding: '0 8px 0 6px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="m15 18-6-6 6-6"/></svg>
              Agents
            </button>
          </div>
          <div className="p-row gap-12 center wrap-flex">
            <h1 className="p-mono" style={{ fontFamily: 'var(--mono)', fontSize: 22, whiteSpace: 'nowrap', marginBottom: 0 }}>{name}</h1>
            {statusBadge(session.status)}
          </div>
        </div>
      </div>

      {/* Failure banner */}
      {session.status === 'failed' && (
        <div className="p-alert alert-destructive" style={{ marginBottom: 20 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12"/></svg>
          <div className="grow">
            <p className="alert-title">Setup failed</p>
            <p className="alert-desc">{session.error_msg ?? 'An error occurred during setup.'} Delete this agent and create a new one to try again.</p>
          </div>
          <button className="btn btn-destructive btn-sm" style={{ flexShrink: 0 }} onClick={() => setShowDeleteConfirm(true)}>
            Delete agent
          </button>
        </div>
      )}

      {/* Stepper */}
      {isFullStack ? (
        <PhaseStepper phases={fsPhases} currentIndex={fsPhaseIndex} failed={fsFailed} />
      ) : (
        <div className="p-card" style={{ marginBottom: 20 }}>
          <div className="card-content" style={{ padding: '28px 28px 24px' }}>
            <div className="stepper">
              {STATUS_STEPS.map(step => (
                <div key={step.sub} className={`step ${stepClass(step.status)}`}>
                  <div className="bar"/>
                  <div className="node">
                    {stepClass(step.status) === 'done' ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path d="M20 6 9 17l-5-5"/></svg>
                    ) : stepClass(step.status) === 'active' ? (
                      <svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    ) : stepClass(step.status) === 'failed' ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M18 6 6 18M6 6l12 12"/></svg>
                    ) : (STATUS_STEPS.findIndex(s => s.sub === step.sub) + 1)}
                  </div>
                  <div className="s-label">{step.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Which stack this agent runs against — the first question when it
          misbehaves, and where an orphaned agent is told its stack is gone. */}
      {!isFullStack && <ConnectedToCard session={session} />}

      {/* DID block (vta_only — full_stack's DIDs live in the Endpoints/DIDs cards below) */}
      {!isFullStack && session.vta_did && (
        <CollectedDidsCard collected={{ vta_did: session.vta_did }} />
      )}

      {/* Full-width action card — shown when VTA setup is done and admin DID is needed */}
      {isAwaitingAdmin && (
        <div className="p-card" style={{ marginBottom: 20, borderColor: 'hsl(var(--primary)/.35)' }}>
          <div className="card-header with-action">
            <div>
              <h3 className="card-title">Step {adminDidStep} — Connect locally &amp; provision</h3>
              <p className="card-desc">
                Run <span className="p-mono">pnm setup</span> locally and paste the admin DID it outputs.
              </p>
            </div>
            <span className="p-badge" style={{ background: 'hsl(var(--destructive)/.12)', color: 'hsl(var(--destructive))', borderColor: 'hsl(var(--destructive)/.3)', flexShrink: 0 }}>
              Action required
            </span>
          </div>
          <div className="card-content p-col gap-16">
            {vtaDid && (
              <div className="p-card" style={{ background: 'hsl(var(--muted)/.4)', border: 'none' }}>
                <div className="card-content" style={{ padding: '12px 16px' }}>
                  <div className="p-row between center" style={{ gap: 12 }}>
                    <div className="p-col" style={{ minWidth: 0 }}>
                      <span className="p-muted text-xs" style={{ letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
                        VTA DID
                      </span>
                      <p className="p-mono" style={{ margin: '4px 0 0', fontSize: 12, wordBreak: 'break-all', color: 'hsl(var(--foreground))' }}>
                        {vtaDid}
                      </p>
                    </div>
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ flexShrink: 0, gap: 6 }}
                      onClick={() => copyVtaDid(vtaDid)}
                    >
                      {copiedVta
                        ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width: 14, height: 14 }}><path d="M20 6 9 17l-5-5"/></svg>
                        : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 14, height: 14 }}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      }
                      {copiedVta ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div>
              <label className="p-label" htmlFor="sd-did">Admin DID <span className="req">*</span></label>
              <div className="input-group">
                <input
                  id="sd-did"
                  className="p-input p-mono"
                  placeholder="did:key:z6Mk…"
                  value={adminDid}
                  onChange={e => setAdminDid(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleProvision()}
                  disabled={provisioning}
                  autoFocus
                />
              </div>
              <div className="field-hint">Paste the <span className="p-mono">did:key:…</span> generated by your local identity tool.</div>
            </div>
            {provisionError && (
              <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{provisionError}</p>
            )}
          </div>
          <div className="card-footer between">
            <span className="field-hint" style={{ marginTop: 0 }}>The agent will begin provisioning as soon as the DID is confirmed.</span>
            <button
              className="btn btn-default"
              onClick={handleProvision}
              disabled={provisioning || !adminDid.trim()}
            >
              {provisioning
                ? <><svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width: 14, height: 14 }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Provisioning…</>
                : <>Provision agent <span className="arrow">→</span></>}
            </button>
          </div>
        </div>
      )}

      {/* Enrollment/install links + collected DIDs — top of page, only once the stack is fully running */}
      {isFullStackCompleted && (
        <>
          <DidsEnrollAlert {...didsEnroll} />
          <VtcInstallAlert {...vtcInstall} />
          <CollectedDidsCard collected={session.collected} />
        </>
      )}

      <div className="p-grid-2" style={{ gridTemplateColumns: '1.6fr 1fr', alignItems: 'start' }}>
        {/* Log console */}
        <div className="p-console">
          <div className="console-head">
            <div className="dots"><span/><span/><span/></div>
            <span className="p-mono">vtafarm · provision --follow {name}</span>
            <span className="grow"/>
            {logs.length > 0 && session.status !== 'running' && session.status !== 'failed' && (
              <span className="p-badge badge-warning" style={{ height: 18, fontSize: 10, background: 'hsl(35 92% 50% /.16)' }}>
                <span className="dot pulse-dot"/>streaming
              </span>
            )}
          </div>
          <div className="console-body" style={{ minHeight: 120 }} ref={consoleBodyRef}>
            {logs.length === 0 ? (
              <div className="ln"><span className="p-muted text-xs">
                {isAwaitingAdmin ? 'Waiting for admin DID provisioning…' : 'No logs yet.'}
              </span></div>
            ) : logs.map((line, i) => (
              <div key={i} className="ln"><span className="msg">{line}</span></div>
            ))}
          </div>
        </div>

        {/* Metadata */}
        <div className="p-col gap-16">

          <div className="p-card">
            <div className="card-header"><h3 className="card-title">Configuration</h3></div>
            <div className="card-content p-col gap-12" style={{ paddingTop: 14 }}>
              <div className="p-row between"><span className="p-muted text-sm">Mode</span><span className="p-badge badge-secondary">{session.mode}</span></div>
              <hr className="p-sep"/>
              <div className="p-row between center">
                <span className="p-muted text-sm">Domain</span>
                <div className="p-row gap-8 center">
                  {session.domain && <span className="p-mono text-xs">{session.domain}</span>}
                  {domainTypeBadge(session.domain_type)}
                </div>
              </div>
              {session.domain_type === 'custom' && (
                <div className="field-hint" style={{ marginTop: -4 }}>
                  Your own domain —{' '}
                  <button type="button" className="btn btn-ghost btn-sm" style={{ padding: 0, height: 'auto' }}
                    onClick={() => navigate('/portal/domains')}>
                    manage it under Domains
                  </button>
                  . Its hostnames can't be changed: this agent's DIDs embed them permanently.
                </div>
              )}
              <hr className="p-sep"/>
              <div className="p-row between"><span className="p-muted text-sm">Created</span><span className="text-sm">{new Date(session.created_at).toLocaleString()}</span></div>
              {!isFullStack && session.url && (
                <><hr className="p-sep"/><ConfigLinkRow label="VTA" href={`${session.url}/health`} value={`${session.url}/health`} /></>
              )}
              {!isFullStack && session.mediator_did && (
                <><hr className="p-sep"/><div className="p-row between center"><span className="p-muted text-sm">Mediator</span><span className="p-mono text-xs">{session.mediator_did.slice(-12)}</span></div></>
              )}
              {isFullStackCompleted && <EndpointConfigRows urls={session.urls} />}
              {isFullStackCompleted && <DidsEnrollConfigRow {...didsEnroll} />}
              {isFullStackCompleted && <VtcInstallConfigRow {...vtcInstall} />}
            </div>
          </div>
          {/* Hand this stack's mediator and DID hosting to someone else's
              VTA-only agent. Refetches so the delete confirm below sees the
              connection list the moment it changes. */}
          <ShareStackCard
            session={session}
            onChanged={() => api.getSession(sessionId).then(setSession).catch(() => {})}
          />
          {/* Self-service version changes — only once the stack is fully running */}
          {session.status === 'running' && (
            <SessionVersionsCard
              session={session}
              onUpgraded={() => api.getSession(sessionId).then(setSession).catch(() => {})}
            />
          )}
          {/* Secrets sit last before Danger Zone — both are things you visit
              deliberately, not while reading the page top to bottom. */}
          {isFullStackCompleted && <AdminKeysCard session={session} />}
          {/* Danger Zone */}
          <div className="p-card" style={{ borderColor: 'hsl(var(--destructive)/.3)' }}>
            <div className="card-header">
              <h3 className="card-title" style={{ color: 'hsl(var(--destructive))' }}>Danger Zone</h3>
            </div>
            <div className="card-content">
              <hr className="p-sep" style={{ marginBottom: 14 }} />
              <div className="p-col" style={{ gap: 0 }}>
                <span className="text-sm fw-600">Delete Agent</span>
                <span className="p-muted text-xs" style={{ margin: '4px 0 14px' }}>
                  {/* On a custom domain the records are the user's — we never
                      created them and can't remove them. */}
                  {session.domain_type === 'custom'
                    ? 'Permanently removes the agent and all session data. Your own DNS records are left untouched.'
                    : 'Permanently removes the agent, DNS record, and all session data.'}
                </span>
                <div>
                  <button
                    className="btn btn-destructive btn-sm"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    Delete Agent
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirm overlay */}
      {showDeleteConfirm && (
        <div className="p-overlay">
          <div className="p-dialog">
            <div className="dialog-header">
              <h3 className="dialog-title">Delete this agent?</h3>
              <p className="dialog-desc">
                {session.domain_type === 'custom'
                  ? <>This permanently destroys <span className="p-mono">{name}</span> and its session data. This cannot be undone.</>
                  : <>This permanently destroys <span className="p-mono">{name}</span>, its DNS record, and its session data. This cannot be undone.</>}
              </p>
            </div>
            <div className="dialog-body">
              {session.domain_type === 'custom' && (
                <div className="p-alert alert-warning">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
                  <div className="grow">
                    <p className="alert-title">Your DNS records stay as they are</p>
                    <p className="alert-desc">
                      Delete the four CNAMEs at your provider afterwards — a record left
                      pointing at a service you no longer run is a security risk. Your domain
                      stays attached and can back a new agent.
                    </p>
                  </div>
                </div>
              )}
              {/* Deleting a shared stack is allowed and breaks every agent on
                  it, so this is the only place the owner is told. Both halves
                  matter: they cannot be reconnected (a did:webvh contains its
                  host, so there is no path back), and nothing of theirs is
                  deleted — without that, the confirm reads as far more
                  destructive than it is. */}
              {!!session.connections?.length && (
                <div className="p-alert alert-warning">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
                  <div className="grow">
                    <p className="alert-title">
                      {session.connections.length} other {session.connections.length === 1 ? 'person’s agent connects' : 'people’s agents connect'} to this stack
                    </p>
                    <p className="alert-desc">
                      <span className="p-mono">{session.connections.map(c => c.vta_name).join(', ')}</span>
                      <span style={{ display: 'block', marginTop: 6 }}>
                        Deleting this stops them working — they will be able to see why, but not fix
                        it, and they cannot be reconnected. Their agents keep running otherwise;
                        nothing of theirs is deleted.
                      </span>
                    </p>
                  </div>
                </div>
              )}
              <div>
                <label className="p-label">Type the agent's name <span className="p-mono">{name}</span> to confirm</label>
                <input className="p-input p-mono" placeholder={name} value={deleteInput} onChange={e => setDeleteInput(e.target.value)} />
              </div>
              {deleteError && (
                <p style={{ margin: '12px 0 0', fontSize: 13, color: 'hsl(var(--destructive))' }}>{deleteError}</p>
              )}
            </div>
            <div className="dialog-footer">
              <button className="btn btn-ghost" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button className="btn btn-destructive" onClick={handleDelete} disabled={deleting || deleteInput !== name}>
                {deleting ? 'Deleting…' : 'Delete Agent'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
