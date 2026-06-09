import { useState, useEffect } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { api, API_BASE } from '@/lib/api'
import type { PortalContext } from './Portal'

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
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [adminDid, setAdminDid] = useState('')
  const [provisionError, setProvisionError] = useState('')
  const [provisioning, setProvisioning] = useState(false)
  const [logs, setLogs] = useState<string[]>([])

  useEffect(() => {
    api.listImages()
      .then(imgs => { setImages(imgs); setSelectedImage(imgs[0]?.image ?? '') })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (stage !== 2 || !sessionId) return
    const es = new EventSource(`${API_BASE}/api/v1/setup/${sessionId}/logs`, { withCredentials: true })
    es.onmessage = e => setLogs(prev => [...prev, e.data])
    es.addEventListener('done', () => { es.close(); setStage(3) })
    es.onerror = () => es.close()
    return () => es.close()
  }, [stage, sessionId])

  useEffect(() => {
    if (stage !== 2 || !sessionId) return
    const iv = setInterval(async () => {
      try {
        const s = await api.getSession(sessionId)
        if (s.status === 'running') { clearInterval(iv); setStage(3) }
        if (s.status === 'failed') { clearInterval(iv); setLogs(p => [...p, `ERROR: ${s.error_msg ?? 'Setup failed'}`]) }
      } catch {}
    }, 5000)
    return () => clearInterval(iv)
  }, [stage, sessionId])

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

  const stepState = (i: number) => i < stage ? 'done' : i === stage ? 'active' : ''

  return (
    <section className="p-content" style={{ maxWidth: 840 }}>
      <div className="page-head">
        <div>
          <h1>Create a Verifiable Trust Agent</h1>
          <p className="sub">Configure your VTA session — Cipher provisions the agent online.</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={handleDone}>Cancel</button>
      </div>

      {/* Stepper */}
      <div className="p-card" style={{ marginBottom: 20 }}>
        <div className="card-content" style={{ padding: '26px 28px 22px' }}>
          <div className="stepper">
            {(['Create session', 'Connect locally', 'Provision', 'Running'] as const).map((label, i) => (
              <div key={i} className={`step ${stepState(i)}`}>
                <div className="bar" />
                <div className="node">
                  {i < stage ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path d="M20 6 9 17l-5-5"/></svg>
                  ) : stage === 2 && i === 2 ? (
                    <svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  ) : i + 1}
                </div>
                <div className="s-label">{label}</div>
              </div>
            ))}
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

      {/* Stage 1 */}
      {stage === 1 && sessionId && (
        <>
          <div className="p-alert alert-info" style={{ marginBottom: 16 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z"/><path d="m9 12 2 2 4-4"/></svg>
            <div className="grow">
              <p className="alert-title">Session created</p>
              <p className="alert-desc p-mono" style={{ wordBreak: 'break-all' }}>Session #{sessionId} · {vtaName}</p>
            </div>
          </div>
          <div className="p-card">
            <div className="card-header">
              <h3 className="card-title">Provision admin DID</h3>
              <p className="card-desc">Generate your admin identity locally and paste the DID below.</p>
            </div>
            <div className="card-content p-col gap-16">
              <div>
                <div className="p-label">Enter your admin DID</div>
                <div className="input-group">
                  <input className="p-input p-mono" type="text" placeholder="did:key:z6Mk…"
                    value={adminDid} onChange={e => setAdminDid(e.target.value)} />
                  {adminDid && (
                    <button className="ig-suffix" type="button" onClick={() => navigator.clipboard.writeText(adminDid).catch(() => {})}>copy</button>
                  )}
                </div>
                <div className="field-hint">Generate with your local identity tool and paste the <span className="p-mono">did:key:…</span> here.</div>
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
          <div className="p-card">
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
        </>
      )}
    </section>
  )
}
