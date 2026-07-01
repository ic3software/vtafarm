import { useState, useEffect, useRef } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { api, API_BASE, type SetupSession } from '@/lib/api'
import type { PortalContext } from './Portal'
import { statusBadge, FULL_STACK_PHASES, phaseIndex, isValidAdminDid } from './portalUtils'
import { PhaseStepper } from './PhaseStepper'
import { DidsEnrollAlert, CollectedDidsCard, EndpointConfigRows, AdminKeysCard } from './FullStackOutputs'

export function FullStackCreateProgress({ sessionId, vtaName }: { sessionId: string; vtaName: string }) {
  const { loadSessions } = useOutletContext<PortalContext>()
  const navigate = useNavigate()

  const [session, setSession] = useState<SetupSession | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const consoleBodyRef = useRef<HTMLDivElement>(null)

  const [adminDid, setAdminDid] = useState('')
  const [provisioning, setProvisioning] = useState(false)
  const [provisionError, setProvisionError] = useState('')
  const [copiedVta, setCopiedVta] = useState(false)

  function copyVtaDid(did: string) {
    navigator.clipboard.writeText(did).catch(() => {})
    setCopiedVta(true)
    setTimeout(() => setCopiedVta(false), 2000)
  }

  // Poll session status
  useEffect(() => {
    const check = () => api.getSession(sessionId).then(setSession).catch(() => {})
    check()
    const iv = setInterval(check, 3000)
    return () => clearInterval(iv)
  }, [sessionId])

  // Reconnect the log stream whenever the raw status changes — each step is its own Job/pod.
  useEffect(() => {
    if (!session || session.status === 'failed' || session.status === 'awaiting_admin_did') return
    setLogs([])
    const es = new EventSource(`${API_BASE}/api/v1/setup/${sessionId}/logs`, { withCredentials: true })
    es.onmessage = e => setLogs(prev => [...prev, e.data])
    es.addEventListener('done', () => es.close())
    es.onerror = () => es.close()
    return () => es.close()
  }, [sessionId, session?.status])

  // Scroll only within the console body — not the whole page — as new lines arrive.
  useEffect(() => {
    const el = consoleBodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs])

  function handleDone() {
    loadSessions()
    navigate('/portal')
  }

  async function handleProvision() {
    const trimmed = adminDid.trim()
    if (!trimmed) { setProvisionError('Enter the admin DID from pnm'); return }
    if (!isValidAdminDid(trimmed)) {
      setProvisionError('Invalid did:key — make sure you copied only the did:key value (e.g. did:key:z6Mk…) with no surrounding text, labels, quotes, or whitespace.')
      return
    }
    setProvisionError(''); setProvisioning(true)
    try {
      await api.provisionAdmin(sessionId, trimmed)
    } catch (err) {
      setProvisionError(err instanceof Error ? err.message : 'Provisioning failed')
    } finally {
      setProvisioning(false)
    }
  }

  const status = session?.status
  const failed = status === 'failed'
  const completed = status === 'running'
  const currentIndex = Math.max(0, phaseIndex(FULL_STACK_PHASES, status))
  const currentPhaseLabel = FULL_STACK_PHASES[currentIndex]?.label ?? 'Setup'

  return (
    <>
      {/* Live status bar */}
      <div className="p-card" style={{ marginBottom: 16 }}>
        <div className="card-content" style={{ padding: '14px 20px' }}>
          <div className="p-row between center">
            <div className="p-col" style={{ gap: 4 }}>
              <span className="p-label" style={{ marginBottom: 0 }}>
                Session #{sessionId} · <span className="p-mono">{vtaName}</span>
              </span>
              {session?.urls?.vta
                ? <span className="p-mono text-xs p-muted">{session.urls.vta}</span>
                : <span className="text-xs p-muted">Waiting for DNS provisioning…</span>
              }
            </div>
            <div className="p-row gap-8 center">
              {session && statusBadge(session.status)}
              <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/portal/session/${sessionId}`)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 14, height: 14 }}><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
                View session
              </button>
            </div>
          </div>
        </div>
      </div>

      <PhaseStepper phases={FULL_STACK_PHASES} currentIndex={currentIndex} failed={failed} />

      {failed ? (
        <>
          <div className="p-alert alert-destructive" style={{ marginBottom: 16 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12"/></svg>
            <div className="grow">
              <p className="alert-title">Setup failed</p>
              <p className="alert-desc">{session?.error_msg || 'An error occurred. Please delete this agent and try again.'}</p>
            </div>
          </div>
          <div className="p-card">
            <div className="card-footer between">
              <span className="field-hint" style={{ marginTop: 0 }}>Delete this agent to release resources, then create a new one.</span>
              <div className="p-row gap-12">
                <button className="btn btn-ghost" onClick={handleDone}>Back to Agents</button>
                <button className="btn btn-destructive" onClick={() => navigate(`/portal/session/${sessionId}`)}>
                  Delete agent <span className="arrow">→</span>
                </button>
              </div>
            </div>
          </div>
        </>
      ) : status === 'awaiting_admin_did' ? (
        <div className="p-card">
          <div className="card-header">
            <h3 className="card-title">Provision admin DID</h3>
            <p className="card-desc">
              VTA, Mediator and DID Hosting are up. Run <span className="p-mono">pnm setup</span> locally and paste the admin DID it outputs.
            </p>
          </div>
          <div className="card-content p-col gap-16">
            {session?.collected?.vta_did && (
              <div className="p-card" style={{ background: 'hsl(var(--muted)/.4)', border: 'none' }}>
                <div className="card-content" style={{ padding: '12px 16px' }}>
                  <div className="p-row between center" style={{ gap: 12 }}>
                    <div className="p-col" style={{ minWidth: 0 }}>
                      <span className="p-muted text-xs" style={{ letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
                        VTA DID
                      </span>
                      <p className="p-mono" style={{ margin: '4px 0 0', fontSize: 12, wordBreak: 'break-all', color: 'hsl(var(--foreground))' }}>
                        {session.collected.vta_did}
                      </p>
                    </div>
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ flexShrink: 0, gap: 6 }}
                      onClick={() => copyVtaDid(session.collected!.vta_did!)}
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
              <div className="p-label">Admin DID</div>
              <div className="input-group">
                <input className="p-input p-mono" type="text" placeholder="did:key:z6Mk…" autoFocus
                  value={adminDid} onChange={e => setAdminDid(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleProvision()} />
              </div>
              <div className="field-hint">Paste the <span className="p-mono">did:key:…</span> generated by your local identity tool.</div>
            </div>
            {provisionError && <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{provisionError}</p>}
          </div>
          <div className="card-footer between">
            <button className="btn btn-ghost" onClick={handleDone}>Cancel</button>
            <button className="btn btn-default" onClick={handleProvision} disabled={provisioning || !adminDid.trim() || !session?.collected?.vta_did}>
              {provisioning ? 'Provisioning…' : <>Provision agent <span className="arrow">→</span></>}
            </button>
          </div>
        </div>
      ) : completed ? (
        <>
          <div className="p-alert alert-success" style={{ marginBottom: 16 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z"/><path d="m9 12 2 2 4-4"/></svg>
            <div className="grow">
              <p className="alert-title">Stack is online</p>
              <p className="alert-desc"><span className="p-mono">{vtaName}</span> is provisioned and running.</p>
            </div>
          </div>

          {session && <DidsEnrollAlert session={session} />}
          <CollectedDidsCard collected={session?.collected} />

          <div className="p-card" style={{ marginBottom: 16 }}>
            <div className="card-header"><h3 className="card-title">Configuration</h3></div>
            <div className="card-content p-col gap-12" style={{ paddingTop: 14 }}>
              <div className="p-row between"><span className="p-muted text-sm">Mode</span><span className="p-badge badge-secondary">full_stack</span></div>
              <EndpointConfigRows urls={session?.urls} />
            </div>
          </div>

          {session && <AdminKeysCard session={session} />}

          <div className="p-card" style={{ marginTop: 16 }}>
            <div className="card-footer between">
              <span className="field-hint" style={{ marginTop: 0 }}>Your stack is ready to issue and verify credentials.</span>
              <div className="p-row gap-12">
                <button className="btn btn-ghost" onClick={handleDone}>Back to Agents</button>
                <button className="btn btn-default" onClick={() => navigate(`/portal/session/${sessionId}`)}>
                  Open agent <span className="arrow">→</span>
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="p-card" style={{ marginBottom: 16 }}>
            <div className="card-header with-action">
              <div>
                <h3 className="card-title">{currentPhaseLabel}</h3>
                <p className="card-desc">Streaming setup output for <span className="p-mono">{vtaName}</span>.</p>
              </div>
              <span className="p-badge badge-warning"><span className="dot pulse-dot"/>streaming</span>
            </div>
            <div className="card-content">
              <div className="p-console">
                <div className="console-head">
                  <div className="dots"><span/><span/><span/></div>
                  <span className="p-mono">vtafarm · {currentPhaseLabel.toLowerCase()} {vtaName}</span>
                  <span className="grow"/>
                  <span className="p-badge badge-warning" style={{ height: 18, fontSize: 10, background: 'hsl(35 92% 50% /.16)' }}>
                    <span className="dot pulse-dot"/>streaming
                  </span>
                </div>
                <div className="console-body" ref={consoleBodyRef}>
                  {logs.length === 0 ? (
                    <div className="ln"><span className="p-muted text-xs">Waiting for output…<span className="caret"/></span></div>
                  ) : logs.map((line, i) => (
                    <div key={i} className="ln"><span className="msg">{line}</span></div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="p-card">
            <div className="card-footer between">
              <span className="field-hint" style={{ marginTop: 0 }}>This can take several minutes — feel free to leave this page.</span>
              <button className="btn btn-ghost" onClick={handleDone}>Back to Agents</button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
