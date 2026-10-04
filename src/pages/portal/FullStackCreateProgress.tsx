import { useState, useEffect, useRef } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { api, API_BASE, type SetupSession } from '@/lib/api'
import type { PortalContext } from './Portal'
import { statusBadge, FULL_STACK_PHASES, phaseIndex } from './portalUtils'
import { PhaseStepper } from './PhaseStepper'
import { DidsEnrollAlert, DidsEnrollConfigRow, VtcInstallAlert, VtcInstallConfigRow, CollectedDidsCard, EndpointConfigRows } from './FullStackOutputs'
import { useDidsEnroll, useVtcInstall } from './fullStackHooks'
import { VtaConnectionCard } from './VtaConnectionCard'

export function FullStackCreateProgress({ sessionId, vtaName }: { sessionId: string; vtaName: string }) {
  const { loadSessions } = useOutletContext<PortalContext>()
  const navigate = useNavigate()

  const [session, setSession] = useState<SetupSession | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const consoleBodyRef = useRef<HTMLDivElement>(null)

  const phases = FULL_STACK_PHASES
  const didsEnroll = useDidsEnroll(session)
  const vtcInstall = useVtcInstall(session)

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
    // Clear when the stream actually opens rather than up front: the previous
    // step's output stays on screen through the reconnect instead of blanking,
    // and the setState leaves the effect body (react-hooks/set-state-in-effect).
    let cleared = false
    const clearOnce = () => { if (!cleared) { cleared = true; setLogs([]) } }
    const es = new EventSource(`${API_BASE}/api/v1/setup/${sessionId}/logs`, { withCredentials: true })
    es.onopen = clearOnce
    es.onmessage = e => { clearOnce(); setLogs(prev => [...prev, e.data]) }
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

  function handleDone() {
    loadSessions()
    navigate('/portal')
  }

  const status = session?.status
  const failed = status === 'failed'
  const completed = status === 'running'
  const progressStatus = failed ? session?.failed_stage ?? 'running' : status
  const currentIndex = Math.max(0, phaseIndex(phases, progressStatus))
  const currentPhaseLabel = phases[currentIndex]?.label ?? 'Setup'
  const terminalLabel = `vtafarm · setup --follow ${vtaName}`

  return (
    <>
      {completed && (
        <div className="p-alert alert-success" style={{ marginBottom: 16 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z"/><path d="m9 12 2 2 4-4"/></svg>
          <div className="grow">
            <p className="alert-title">Stack is online</p>
            <p className="alert-desc"><span className="p-mono">{vtaName}</span> is provisioned and running.</p>
          </div>
        </div>
      )}

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

      <PhaseStepper phases={phases} currentIndex={currentIndex} failed={failed} />

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
        session?.collected?.vta_did ? (
          <VtaConnectionCard
            session={session}
            sessionId={sessionId}
            vtaDid={session.collected.vta_did}
            ready
            onSessionChange={setSession}
          />
        ) : null
      ) : completed ? (
        <>
          <DidsEnrollAlert {...didsEnroll} />
          <VtcInstallAlert {...vtcInstall} />
          <CollectedDidsCard collected={session?.collected} />

          <div className="p-card" style={{ marginBottom: 16 }}>
            <div className="card-header"><h3 className="card-title">Configuration</h3></div>
            <div className="card-content p-col gap-12" style={{ paddingTop: 14 }}>
              <div className="p-row between"><span className="p-muted text-sm">Mode</span><span className="p-badge badge-secondary">{session?.mode ?? 'full_stack'}</span></div>
              <EndpointConfigRows urls={session?.urls} />
              <DidsEnrollConfigRow {...didsEnroll} />
              <VtcInstallConfigRow {...vtcInstall} />
            </div>
          </div>

          <div className="p-card">
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
            <div className="card-header">
              <div>
                <h3 className="card-title">{currentPhaseLabel}</h3>
                <p className="card-desc">Streaming setup output for <span className="p-mono">{vtaName}</span>.</p>
              </div>
            </div>
            <div className="card-content">
              <div className="p-console">
                <div className="console-head">
                  <div className="dots"><span/><span/><span/></div>
                  <span className="p-mono">{terminalLabel}</span>
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
