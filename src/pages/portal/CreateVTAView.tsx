import { useState, useEffect, useRef } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { api, API_BASE, type SetupSession } from '@/lib/api'
import type { PortalContext } from './Portal'
import { statusBadge } from './portalUtils'

type Stage = 0 | 1 | 2 | 3

export function CreateVTAView() {
  const { loadSessions } = useOutletContext<PortalContext>()
  const navigate = useNavigate()

  const [stage, setStage] = useState<Stage>(0)
  const [vtaName, setVtaName] = useState('personal-vta')
  const [images, setImages] = useState<Array<{ tag: string; image: string }>>([])
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

  function copyVtaDid(did: string) {
    navigator.clipboard.writeText(did).catch(() => {})
    setCopiedVta(true)
    setTimeout(() => setCopiedVta(false), 2000)
  }

  useEffect(() => {
    api.listImages()
      .then(imgs => { setImages(imgs); setSelectedImage(imgs[0]?.image ?? '') })
      .catch(() => {})
  }, [])

  // Poll session status every 3 s during Stage 1 so the FQDN appears as soon as DNS is ready
  useEffect(() => {
    if (stage !== 1 || !sessionId) return
    api.getSession(sessionId).then(setLiveSession).catch(() => {})
    const iv = setInterval(() => {
      api.getSession(sessionId).then(setLiveSession).catch(() => {})
    }, 3000)
    return () => clearInterval(iv)
  }, [stage, sessionId])

  useEffect(() => {
    if (stage !== 2 || !sessionId) return
    const es = new EventSource(`${API_BASE}/api/v1/setup/${sessionId}/logs`, { withCredentials: true })
    es.onmessage = e => setLogs(prev => [...prev, e.data])
    es.addEventListener('done', () => { es.close() })
    es.onerror = () => es.close()
    return () => es.close()
  }, [stage, sessionId])

  useEffect(() => {
    if (stage !== 2 || !sessionId) return
    const iv = setInterval(async () => {
      try {
        const s = await api.getSession(sessionId)
        if (['running', 'complete'].includes(s.status)) { clearInterval(iv); setStage(3) }
        if (s.status === 'failed') { clearInterval(iv); setLogs(p => [...p, `ERROR: ${s.error_msg ?? 'Setup failed'}`]) }
      } catch {}
    }, 3000)
    return () => clearInterval(iv)
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
    if (!liveSession) return 1
    switch (liveSession.status) {
      case 'dns_provisioned': return 1
      case 'vta_setup_running': return 2
      case 'vta_setup_complete': return 3
      default: return 1
    }
  })()

  return (
    <section className="p-content" style={{ maxWidth: 840 }}>
      <div className="page-head">
        <div>
          <h1>Create a Verifiable Trust Agent</h1>
          <p className="sub">Configure your VTA session — Cipher provisions the agent online.</p>
        </div>
        <button className="btn btn-outline" onClick={handleDone}>Cancel</button>
      </div>

      {/* Stepper */}
      <div className="p-card" style={{ marginBottom: 20 }}>
        <div className="card-content" style={{ padding: '26px 28px 22px' }}>
          <div className="stepper">
            {(['Create session', 'DNS provisioned', 'Setup running', 'Setup complete', 'Provisioning', 'Running'] as const).map((label, i) => {
              const s = i < currentStep ? 'done' : i === currentStep ? 'active' : ''
              return (
                <div key={i} className={`step ${s}`}>
                  <div className="bar" />
                  <div className="node">
                    {i < currentStep ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path d="M20 6 9 17l-5-5"/></svg>
                    ) : i === currentStep && stage === 2 ? (
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
                <select className="p-select p-mono" id="cv-image" value={selectedImage} onChange={e => setSelectedImage(e.target.value)}>
                  {images.map(img => <option key={img.image} value={img.image}>{img.tag}</option>)}
                </select>
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

      {/* Stage 1 — wait for vta_setup_complete, then accept admin DID */}
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

          {liveSession?.status !== 'vta_setup_complete' ? (
            /* Waiting for VTA setup to finish */
            <div className="p-card">
              <div className="card-header with-action">
                <div>
                  <h3 className="card-title">VTA setup in progress</h3>
                  <p className="card-desc">Cipher is preparing the VTA environment. This usually takes a minute.</p>
                </div>
                <span className="p-badge badge-warning"><span className="dot pulse-dot"/>waiting</span>
              </div>
              <div className="card-content">
                <div className="p-console">
                  <div className="console-head">
                    <div className="dots"><span/><span/><span/></div>
                    <span className="p-mono">cipher · vta-setup {vtaName}</span>
                    <span className="grow"/>
                    <span className="p-badge badge-warning" style={{ height: 18, fontSize: 10, background: 'hsl(35 92% 50% /.16)' }}>
                      <span className="dot pulse-dot"/>polling
                    </span>
                  </div>
                  <div className="console-body" style={{ minHeight: 64 }}>
                    <div className="ln"><span className="p-muted text-xs">
                      {liveSession?.status === 'vta_setup_running'
                        ? 'VTA setup running — waiting for completion…'
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
          ) : (
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
          )}
        </>
      )}

      {/* Stage 2 */}
      {stage === 2 && (
        <div className="p-card">
          <div className="card-header with-action">
            <div><h3 className="card-title">Provisioning agent</h3><p className="card-desc">Cipher is bringing <span className="p-mono">{vtaName}</span> online.</p></div>
            <span className="p-badge badge-warning"><span className="dot pulse-dot"/>vta_starting</span>
          </div>
          <div className="card-content">
            <div className="p-console">
              <div className="console-head">
                <div className="dots"><span/><span/><span/></div>
                <span className="p-mono">cipher · provision --follow {vtaName}</span>
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
          {logs.length > 0 && (
            <div className="p-card">
              <div className="card-content" style={{ padding: 0 }}>
                <div className="p-console">
                  <div className="console-head">
                    <div className="dots"><span/><span/><span/></div>
                    <span className="p-mono">cipher · provision --follow {vtaName}</span>
                    <span className="grow"/>
                    <span className="p-badge badge-success" style={{ height: 18, fontSize: 10 }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} style={{ width: 10, height: 10 }}><path d="M20 6 9 17l-5-5"/></svg>
                      complete
                    </span>
                  </div>
                  <div className="console-body">
                    {logs.map((line, i) => (
                      <div key={i} className="ln"><span className="msg">{line}</span></div>
                    ))}
                    <div ref={logEndRef} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
