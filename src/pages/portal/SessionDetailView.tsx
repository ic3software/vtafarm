import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { api, type SetupSession, API_BASE } from '@/lib/api'
import { statusBadge } from './portalUtils'
import type { PortalContext } from './Portal'

const STATUS_STEPS: Array<{ label: string; sub: string; status: SetupSession['status'] | null }> = [
  { label: 'Create session',   sub: 'created',            status: null },
  { label: 'DNS provisioned',  sub: 'dns_provisioned',    status: 'dns_provisioned' },
  { label: 'Setup running',    sub: 'vta_setup_running',  status: 'vta_setup_running' },
  { label: 'Setup complete',   sub: 'vta_setup_complete', status: 'vta_setup_complete' },
  { label: 'Provisioning',     sub: 'provisioning',       status: 'provisioning' },
  { label: 'Running',          sub: 'running',            status: 'running' },
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
  const logEndRef = useRef<HTMLDivElement>(null)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [copied, setCopied] = useState(false)
  const [copiedVta, setCopiedVta] = useState(false)

  // Provision form (shown when status === 'vta_setup_complete')
  const [adminDid, setAdminDid] = useState('')
  const [provisioning, setProvisioning] = useState(false)
  const [provisionError, setProvisionError] = useState('')

  function copyDid(did: string) {
    navigator.clipboard.writeText(did).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function copyVtaDid(did: string) {
    navigator.clipboard.writeText(did).catch(() => {})
    setCopiedVta(true)
    setTimeout(() => setCopiedVta(false), 2000)
  }

  function stepClass(stepStatus: SetupSession['status'] | null) {
    if (!session) return ''
    if (session.status === 'running') return 'done'
    if (stepStatus === null) return 'done'
    const cur = ORDER.indexOf(session.status)
    const idx = ORDER.indexOf(stepStatus)
    if (session.status === 'failed') return idx <= cur ? 'failed' : ''
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
  }, [sessionId, session?.status])

  useEffect(() => {
    if (!session) return
    if (session.status === 'dns_provisioned' || session.status === 'vta_setup_complete') return
    const es = new EventSource(`${API_BASE}/api/v1/setup/${sessionId}/logs`, { withCredentials: true })
    es.onmessage = e => setLogs(prev => [...prev, e.data])
    es.addEventListener('done', () => es.close())
    es.onerror = () => es.close()
    return () => es.close()
  }, [sessionId, session?.status])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  async function handleProvision() {
    if (!adminDid.trim()) { setProvisionError('Enter the admin DID from pnm'); return }
    setProvisionError('')
    setProvisioning(true)
    try {
      await api.provisionAdmin(sessionId, adminDid.trim())
      setAdminDid('')
      // Session status will update via the polling interval above
    } catch (err) {
      setProvisionError(err instanceof Error ? err.message : 'Provisioning failed')
    } finally {
      setProvisioning(false)
    }
  }

  async function handleDelete() {
    if (deleteInput !== sessionId) return
    setDeleting(true)
    try {
      await api.deleteSession(sessionId)
      loadSessions()
      navigate('/portal', { replace: true })
    } catch {}
    setDeleting(false)
  }

  const name = session?.vta_name ?? `session-${sessionId}`

  if (loading) return <section className="p-content"><p className="p-muted">Loading…</p></section>
  if (!session) return <section className="p-content"><p className="p-muted">Session not found.</p></section>

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
          {session.url && (
            <p className="sub p-mono" style={{ marginTop: 4 }}>{session.url}</p>
          )}
        </div>
      </div>

      {/* DID block */}
      {session.vta_did && (
        <div className="p-card" style={{ marginBottom: 20 }}>
          <div className="card-content" style={{ padding: '16px 20px' }}>
            <div className="p-row between center" style={{ gap: 12 }}>
              <div className="p-col" style={{ minWidth: 0 }}>
                <span className="p-muted text-xs" style={{ letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>DID</span>
                <p className="p-mono" style={{ margin: '4px 0 0', fontSize: 13, wordBreak: 'break-all', color: 'hsl(var(--foreground))' }}>{session.vta_did}</p>
              </div>
              <button
                className="btn btn-outline btn-sm"
                style={{ flexShrink: 0, gap: 6 }}
                onClick={() => copyDid(session.vta_did!)}
              >
                {copied
                  ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width: 14, height: 14 }}><path d="M20 6 9 17l-5-5"/></svg>
                  : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 14, height: 14 }}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                }
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stepper */}
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

      {/* Full-width action card — shown when VTA setup is done and admin DID is needed */}
      {session.status === 'vta_setup_complete' && (
        <div className="p-card" style={{ marginBottom: 20, borderColor: 'hsl(var(--primary)/.35)' }}>
          <div className="card-header with-action">
            <div>
              <h3 className="card-title">Step 2 — Connect locally &amp; provision</h3>
              <p className="card-desc">
                Run <span className="p-mono">pnm setup</span> locally and paste the admin DID it outputs.
              </p>
            </div>
            <span className="p-badge" style={{ background: 'hsl(var(--destructive)/.12)', color: 'hsl(var(--destructive))', borderColor: 'hsl(var(--destructive)/.3)', flexShrink: 0 }}>
              Action required
            </span>
          </div>
          <div className="card-content p-col gap-16">
            {session.vta_did && (
              <div className="p-card" style={{ background: 'hsl(var(--muted)/.4)', border: 'none' }}>
                <div className="card-content" style={{ padding: '12px 16px' }}>
                  <div className="p-row between center" style={{ gap: 12 }}>
                    <div className="p-col" style={{ minWidth: 0 }}>
                      <span className="p-muted text-xs" style={{ letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
                        VTA DID
                      </span>
                      <p className="p-mono" style={{ margin: '4px 0 0', fontSize: 12, wordBreak: 'break-all', color: 'hsl(var(--foreground))' }}>
                        {session.vta_did}
                      </p>
                    </div>
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ flexShrink: 0, gap: 6 }}
                      onClick={() => copyVtaDid(session.vta_did!)}
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
              {provisioning ? 'Provisioning…' : <>Provision agent <span className="arrow">→</span></>}
            </button>
          </div>
        </div>
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
          <div className="console-body" style={{ minHeight: 120 }}>
            {logs.length === 0 ? (
              <div className="ln"><span className="p-muted text-xs">
                {session.status === 'vta_setup_complete' ? 'Waiting for admin DID provisioning…' : 'No logs yet.'}
              </span></div>
            ) : logs.map((line, i) => (
              <div key={i} className="ln"><span className="msg">{line}</span></div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>

        {/* Metadata */}
        <div className="p-col gap-16">

          <div className="p-card">
            <div className="card-header"><h3 className="card-title">Configuration</h3></div>
            <div className="card-content p-col gap-12" style={{ paddingTop: 14 }}>
              <div className="p-row between"><span className="p-muted text-sm">Mode</span><span className="p-badge badge-secondary">{session.mode}</span></div>
              <hr className="p-sep"/>
              <div className="p-row between"><span className="p-muted text-sm">Created</span><span className="text-sm">{new Date(session.created_at).toLocaleString()}</span></div>
              {session.url && (
                <><hr className="p-sep"/><div className="p-row between"><span className="p-muted text-sm">URL</span><a href={`${session.url}/health`} target="_blank" rel="noopener" className="p-mono text-xs" style={{ color: 'hsl(var(--primary))' }}>{session.url}/health</a></div></>
              )}
              {session.mediator_did && (
                <><hr className="p-sep"/><div className="p-row between center"><span className="p-muted text-sm">Mediator</span><span className="p-mono text-xs">{session.mediator_did.slice(-12)}</span></div></>
              )}
            </div>
          </div>
          {session.error_msg && (
            <div className="p-alert alert-destructive">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>
              <div className="grow"><p className="alert-title">Error</p><p className="alert-desc">{session.error_msg}</p></div>
            </div>
          )}

          {/* Danger Zone */}
          <div className="p-card" style={{ borderColor: 'hsl(var(--destructive)/.3)' }}>
            <div className="card-header">
              <h3 className="card-title" style={{ color: 'hsl(var(--destructive))' }}>Danger Zone</h3>
            </div>
            <div className="card-content">
              <hr className="p-sep" style={{ marginBottom: 14 }} />
              <div className="p-col" style={{ gap: 0 }}>
                <span className="text-sm fw-600">Delete Agent</span>
                <span className="p-muted text-xs" style={{ margin: '4px 0 14px' }}>Permanently removes the agent, DNS record, and all session data.</span>
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
              <p className="dialog-desc">This permanently destroys <span className="p-mono">{name}</span>, its DNS record, and its session data. This cannot be undone.</p>
            </div>
            <div className="dialog-body">
              <div>
                <label className="p-label">Type <span className="p-mono">{sessionId}</span> to confirm</label>
                <input className="p-input p-mono" placeholder={sessionId} value={deleteInput} onChange={e => setDeleteInput(e.target.value)} />
              </div>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-ghost" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button className="btn btn-destructive" onClick={handleDelete} disabled={deleting || deleteInput !== sessionId}>
                {deleting ? 'Deleting…' : 'Delete Agent'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
