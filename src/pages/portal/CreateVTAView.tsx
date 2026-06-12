import { useState, useEffect, useRef } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { api, API_BASE, type SetupSession } from '@/lib/api'
import type { PortalContext } from './Portal'
import { statusBadge } from './portalUtils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Stage = 0 | 1 | 2 | 3

export function CreateVTAView() {
  const { loadSessions } = useOutletContext<PortalContext>()
  const navigate = useNavigate()

  const [stage, setStage] = useState<Stage>(0)
  const [vtaName, setVtaName] = useState('personal-vta')
  const [images, setImages] = useState<Array<{ tag: string; image: string; latest?: boolean }>>([])
  const [selectedImage, setSelectedImage] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [adminDid, setAdminDid] = useState('')
  const [provisionError, setProvisionError] = useState('')
  const [provisioning, setProvisioning] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const logEndRef = useRef<HTMLDivElement>(null)
  const [liveSession, setLiveSession] = useState<SetupSession | null>(null)
  const [copiedVta, setCopiedVta] = useState(false)

  // Stage 1 setup-log streaming state
  const [setupStreamStarted, setSetupStreamStarted] = useState(false)
  const [setupLogsDone, setSetupLogsDone] = useState(false)

  // Stage 2 provisioning-log streaming state
  const [provStreamStarted, setProvStreamStarted] = useState(false)

  function copyVtaDid(did: string) {
    navigator.clipboard.writeText(did).catch(() => {})
    setCopiedVta(true)
    setTimeout(() => setCopiedVta(false), 2000)
  }

  useEffect(() => {
    api.listImages()
      .then(imgs => {
        setImages(imgs)
        const latestImg = imgs.find(i => i.latest) ?? imgs[0]
        setSelectedImage(latestImg?.image ?? '')
      })
      .catch(() => {})
  }, [])

  // Stage 1: poll status; trigger setup log streaming when vta_setup_running
  useEffect(() => {
    if (stage !== 1 || !sessionId) return
    const check = (s: SetupSession) => {
      setLiveSession(s)
      if (s.status === 'vta_setup_running') setSetupStreamStarted(true)
    }
    api.getSession(sessionId).then(check).catch(() => {})
    const iv = setInterval(() => api.getSession(sessionId).then(check).catch(() => {}), 3000)
    return () => clearInterval(iv)
  }, [stage, sessionId])

  // Stage 1: stream setup logs; 2s timer starts only after 'done' event
  useEffect(() => {
    if (!setupStreamStarted || !sessionId) return
    setLogs([])
    let hasLog = false
    let advanceTimer: ReturnType<typeof setTimeout> | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let es: EventSource | null = null
    let cancelled = false

    const scheduleAdvance = () => { if (!advanceTimer) advanceTimer = setTimeout(() => setSetupLogsDone(true), 2000) }

    const connect = () => {
      if (cancelled) return
      es = new EventSource(`${API_BASE}/api/v1/setup/${sessionId}/logs?source=setup`, { withCredentials: true })
      es.onmessage = e => {
        setLogs(prev => [...prev, e.data])
        hasLog = true
      }
      es.addEventListener('done', () => { es!.close(); scheduleAdvance() })
      es.onerror = () => {
        es!.close()
        if (hasLog) { scheduleAdvance() }
        else { retryTimer = setTimeout(connect, 4000) }
      }
    }
    connect()
    return () => {
      cancelled = true
      es?.close()
      if (advanceTimer) clearTimeout(advanceTimer)
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [setupStreamStarted, sessionId])

  // Stage 1 safety net: advance 60s after setup completes if stream never resolves
  useEffect(() => {
    if (!setupStreamStarted || setupLogsDone) return
    if (liveSession?.status !== 'vta_setup_complete') return
    const t = setTimeout(() => setSetupLogsDone(true), 60000)
    return () => clearTimeout(t)
  }, [setupStreamStarted, setupLogsDone, liveSession?.status])

  // Stage 2: poll status to detect failure
  useEffect(() => {
    if (stage !== 2 || !sessionId) return
    const check = (s: SetupSession) => {
      if (s.status === 'failed') setLogs(p => [...p, `ERROR: ${s.error_msg ?? 'Provisioning failed'}`])
    }
    const iv = setInterval(() => api.getSession(sessionId).then(check).catch(() => {}), 3000)
    return () => clearInterval(iv)
  }, [stage, sessionId])

  // Stage 2: stream import-did logs immediately; advance 2s after 'done' event
  useEffect(() => {
    if (stage !== 2 || !sessionId) return
    setProvStreamStarted(true)
    let hasLog = false
    let advanceTimer: ReturnType<typeof setTimeout> | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let es: EventSource | null = null
    let cancelled = false

    const scheduleAdvance = () => { if (!advanceTimer) advanceTimer = setTimeout(() => setStage(3), 2000) }

    const connect = () => {
      if (cancelled) return
      es = new EventSource(`${API_BASE}/api/v1/setup/${sessionId}/logs?source=import-did`, { withCredentials: true })
      es.onmessage = e => {
        setLogs(prev => [...prev, e.data])
        hasLog = true
      }
      es.addEventListener('done', () => { es!.close(); scheduleAdvance() })
      es.onerror = () => {
        es!.close()
        if (hasLog) { scheduleAdvance() }
        else { retryTimer = setTimeout(connect, 4000) }
      }
    }
    connect()
    return () => {
      cancelled = true
      es?.close()
      if (advanceTimer) clearTimeout(advanceTimer)
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [stage, sessionId])

  // Stage 3: stream live VTA logs
  useEffect(() => {
    if (stage !== 3 || !sessionId) return
    setLogs([])
    const es = new EventSource(`${API_BASE}/api/v1/setup/${sessionId}/logs?source=vta`, { withCredentials: true })
    es.onmessage = e => setLogs(prev => [...prev, e.data])
    es.addEventListener('done', () => es.close())
    es.onerror = () => es.close()
    return () => es.close()
  }, [stage, sessionId])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  async function handleCreate() {
    if (!selectedImage) { setCreateError('Select an image'); return }
    setCreateError(''); setCreating(true)
    try {
      const r = await api.createSession({ mode: 'vta_only', vta_image: selectedImage, vta_name: vtaName })
      setSessionId(r.id)
      setStage(1)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create session')
    } finally {
      setCreating(false)
    }
  }

  async function handleProvision() {
    if (!adminDid.trim()) { setProvisionError('Enter the admin DID from pnm'); return }
    if (!sessionId) return
    setProvisionError(''); setProvisioning(true)
    try {
      await api.provisionAdmin(sessionId, adminDid.trim())
      setLogs([])
      setStage(2)
    } catch (err) {
      setProvisionError(err instanceof Error ? err.message : 'Provisioning failed')
    } finally {
      setProvisioning(false)
    }
  }

  function handleDone() {
    loadSessions()
    navigate('/portal')
  }

  const currentStep = (() => {
    if (stage === 3) return 6
    if (stage === 2) return 4
    if (stage === 0) return 0
    if (setupLogsDone) return 3
    if (!liveSession) return 1
    switch (liveSession.status) {
      case 'dns_provisioned': return 1
      case 'vta_setup_running': return 2
      case 'vta_setup_complete': return 3
      default: return 1
    }
  })()

  const showingSetupLogs = stage === 1 && setupStreamStarted && !setupLogsDone
  // Only use status as fallback when we never entered the log-streaming phase
  const showDIDForm = stage === 1 && (
    setupLogsDone ||
    (!setupStreamStarted && liveSession?.status === 'vta_setup_complete')
  )

  return (
    <section className="p-content" style={{ maxWidth: 840 }}>
      <div className="page-head">
        <div>
          <h1>Create a Verifiable Trust Agent</h1>
          <p className="sub">Configure your VTA session — VTA Farm provisions the agent online.</p>
        </div>
        <button className="btn btn-outline" onClick={handleDone}>Cancel</button>
      </div>

      {/* Stepper */}
      <div className="p-card" style={{ marginBottom: 20 }}>
        <div className="card-content" style={{ padding: '26px 28px 22px' }}>
          <div className="stepper">
            {(['Create session', 'DNS provisioned', 'Setup running', 'Setup complete', 'Provisioning', 'Running'] as const).map((label, i) => {
              const s = i < currentStep ? 'done' : i === currentStep ? 'active' : ''
              const spinning = i === currentStep && (stage === 2 || showingSetupLogs)
              return (
                <div key={i} className={`step ${s}`}>
                  <div className="bar" />
                  <div className="node">
                    {i < currentStep ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path d="M20 6 9 17l-5-5"/></svg>
                    ) : spinning ? (
                      <svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    ) : i + 1}
                  </div>
                  <div className="s-label">{label}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Stage 0 */}
      {stage === 0 && (
        <div className="p-card">
          <div className="card-header">
            <h3 className="card-title">Create a session</h3>
            <p className="card-desc">Name your agent and select a VTA image.</p>
          </div>
          <div className="card-content p-col gap-16">
            <div>
              <label className="p-label" htmlFor="cv-name">Agent name <span className="req">*</span></label>
              <div className="input-group">
                <svg className="ig-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>
                <input className="p-input p-mono" id="cv-name" type="text" value={vtaName}
                  onChange={e => setVtaName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} />
              </div>
            </div>
            <div>
              <label className="p-label" htmlFor="cv-image">VTA Image <span className="req">*</span></label>
              {images.length > 0 ? (
                <Select value={selectedImage} onValueChange={setSelectedImage}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {images.map(img => (
                      <SelectItem key={img.image} value={img.image} className="p-mono">
                        {img.tag}{img.latest ? ' [latest]' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <input className="p-input p-mono" placeholder="Loading images…" disabled />
              )}
            </div>
            {createError && <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{createError}</p>}
          </div>
          <div className="card-footer between">
            <span className="field-hint" style={{ marginTop: 0 }}>A DNS record is created immediately after session creation.</span>
            <button className="btn btn-default" onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating…' : <>Create session <span className="arrow">→</span></>}
            </button>
          </div>
        </div>
      )}

      {/* Stage 1 */}
      {stage === 1 && sessionId && (
        <>
          {/* Live status bar */}
          <div className="p-card" style={{ marginBottom: 16 }}>
            <div className="card-content" style={{ padding: '14px 20px' }}>
              <div className="p-row between center">
                <div className="p-col" style={{ gap: 4 }}>
                  <span className="p-label" style={{ marginBottom: 0 }}>
                    Session #{sessionId} · <span className="p-mono">{vtaName}</span>
                  </span>
                  {liveSession?.url
                    ? <span className="p-mono text-xs p-muted">{liveSession.url}</span>
                    : <span className="text-xs p-muted">Waiting for DNS provisioning…</span>
                  }
                </div>
                <div className="p-row gap-8 center">
                  {liveSession && statusBadge(liveSession.status)}
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/portal/session/${sessionId}`)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 14, height: 14 }}><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
                    View session
                  </button>
                </div>
              </div>
            </div>
          </div>

          {showDIDForm ? (
            /* vta_setup_complete — ready for admin DID */
            <div className="p-card">
              <div className="card-header">
                <h3 className="card-title">Provision admin DID</h3>
                <p className="card-desc">
                  VTA setup is complete. Run <span className="p-mono">pnm setup</span> locally and paste the admin DID it outputs.
                </p>
              </div>
              <div className="card-content p-col gap-16">
                {liveSession?.vta_did && (
                  <div className="p-card" style={{ background: 'hsl(var(--muted)/.4)', border: 'none' }}>
                    <div className="card-content" style={{ padding: '12px 16px' }}>
                      <div className="p-row between center" style={{ gap: 12 }}>
                        <div className="p-col" style={{ minWidth: 0 }}>
                          <span className="p-muted text-xs" style={{ letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
                            VTA DID
                          </span>
                          <p className="p-mono" style={{ margin: '4px 0 0', fontSize: 12, wordBreak: 'break-all', color: 'hsl(var(--foreground))' }}>
                            {liveSession.vta_did}
                          </p>
                        </div>
                        <button
                          className="btn btn-outline btn-sm"
                          style={{ flexShrink: 0, gap: 6 }}
                          onClick={() => copyVtaDid(liveSession.vta_did!)}
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
                <button className="btn btn-default" onClick={handleProvision} disabled={provisioning || !adminDid.trim()}>
                  {provisioning ? 'Provisioning…' : <>Provision agent <span className="arrow">→</span></>}
                </button>
              </div>
            </div>
          ) : showingSetupLogs ? (
            /* Streaming setup logs */
            <div className="p-card">
              <div className="card-header with-action">
                <div>
                  <h3 className="card-title">VTA setup running</h3>
                  <p className="card-desc">Streaming setup output for <span className="p-mono">{vtaName}</span>.</p>
                </div>
                <span className="p-badge badge-warning"><span className="dot pulse-dot"/>streaming</span>
              </div>
              <div className="card-content">
                <div className="p-console">
                  <div className="console-head">
                    <div className="dots"><span/><span/><span/></div>
                    <span className="p-mono">vtafarm · vta-setup {vtaName}</span>
                    <span className="grow"/>
                    <span className="p-badge badge-warning" style={{ height: 18, fontSize: 10, background: 'hsl(35 92% 50% /.16)' }}>
                      <span className="dot pulse-dot"/>streaming
                    </span>
                  </div>
                  <div className="console-body">
                    {logs.length === 0 ? (
                      <div className="ln"><span className="p-muted text-xs">Waiting for output…<span className="caret"/></span></div>
                    ) : logs.map((line, i) => (
                      <div key={i} className="ln"><span className="msg">{line}</span></div>
                    ))}
                    <div ref={logEndRef} />
                  </div>
                </div>
              </div>
              <div className="card-footer between">
                <span className="field-hint" style={{ marginTop: 0 }}>
                  Once setup completes you will be prompted to enter your admin DID.
                </span>
                <button className="btn btn-ghost" onClick={handleDone}>Cancel</button>
              </div>
            </div>
          ) : (
            /* Waiting for setup to start */
            <div className="p-card">
              <div className="card-header with-action">
                <div>
                  <h3 className="card-title">VTA setup in progress</h3>
                  <p className="card-desc">VTA Farm is preparing the VTA environment. This usually takes a minute.</p>
                </div>
                <span className="p-badge badge-warning"><span className="dot pulse-dot"/>waiting</span>
              </div>
              <div className="card-content">
                <div className="p-console">
                  <div className="console-head">
                    <div className="dots"><span/><span/><span/></div>
                    <span className="p-mono">vtafarm · vta-setup {vtaName}</span>
                    <span className="grow"/>
                    <span className="p-badge badge-warning" style={{ height: 18, fontSize: 10, background: 'hsl(35 92% 50% /.16)' }}>
                      <span className="dot pulse-dot"/>polling
                    </span>
                  </div>
                  <div className="console-body">
                    <div className="ln"><span className="p-muted text-xs">
                      {liveSession?.status === 'vta_setup_running'
                        ? 'VTA setup running — waiting for output…'
                        : 'DNS provisioned — waiting for VTA setup to start…'}
                      <span className="caret"/>
                    </span></div>
                  </div>
                </div>
              </div>
              <div className="card-footer between">
                <span className="field-hint" style={{ marginTop: 0 }}>
                  Once setup completes you will be prompted to enter your admin DID.
                </span>
                <button className="btn btn-ghost" onClick={handleDone}>Cancel</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Stage 2 */}
      {stage === 2 && (
        <div className="p-card">
          <div className="card-header with-action">
            <div><h3 className="card-title">Provisioning agent</h3><p className="card-desc">VTA Farm is bringing <span className="p-mono">{vtaName}</span> online.</p></div>
            <span className="p-badge badge-warning"><span className="dot pulse-dot"/>{provStreamStarted ? 'streaming' : 'waiting'}</span>
          </div>
          <div className="card-content">
            <div className="p-console">
              <div className="console-head">
                <div className="dots"><span/><span/><span/></div>
                <span className="p-mono">vtafarm · provision --follow {vtaName}</span>
                <span className="grow"/>
                <span className="p-badge badge-warning" style={{ height: 18, fontSize: 10, background: 'hsl(35 92% 50% /.16)' }}>
                  <span className="dot pulse-dot"/>{provStreamStarted ? 'streaming' : 'polling'}
                </span>
              </div>
              <div className="console-body">
                {!provStreamStarted ? (
                  <div className="ln"><span className="p-muted text-xs">Waiting for provisioning to start…<span className="caret"/></span></div>
                ) : logs.length === 0 ? (
                  <div className="ln"><span className="p-muted text-xs">Waiting for output…<span className="caret"/></span></div>
                ) : logs.map((line, i) => (
                  <div key={i} className="ln"><span className="msg">{line}</span></div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stage 3 */}
      {stage === 3 && (
        <>
          <div className="p-alert alert-success" style={{ marginBottom: 16 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z"/><path d="m9 12 2 2 4-4"/></svg>
            <div className="grow">
              <p className="alert-title">Agent is online</p>
              <p className="alert-desc"><span className="p-mono">{vtaName}</span> is provisioned and running.</p>
            </div>
          </div>
          <div className="p-card" style={{ marginBottom: 16 }}>
            <div className="card-footer between">
              <span className="field-hint" style={{ marginTop: 0 }}>Your agent is ready to issue and verify credentials.</span>
              <div className="p-row gap-12">
                <button className="btn btn-ghost" onClick={handleDone}>Back to Agents</button>
                {sessionId && (
                  <button className="btn btn-default" onClick={() => navigate(`/portal/session/${sessionId}`)}>
                    Open agent <span className="arrow">→</span>
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="p-card">
            <div className="card-content" style={{ padding: 0 }}>
              <div className="p-console">
                <div className="console-head">
                  <div className="dots"><span/><span/><span/></div>
                  <span className="p-mono">vtafarm · provision --follow {vtaName}</span>
                  <span className="grow"/>
                  <span className="p-badge badge-success" style={{ height: 18, fontSize: 10 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} style={{ width: 10, height: 10 }}><path d="M20 6 9 17l-5-5"/></svg>
                    complete
                  </span>
                </div>
                <div className="console-body">
                  {logs.length === 0 ? (
                    <div className="ln"><span className="p-muted text-xs">No logs received</span></div>
                  ) : logs.map((line, i) => (
                    <div key={i} className="ln"><span className="msg">{line}</span></div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
