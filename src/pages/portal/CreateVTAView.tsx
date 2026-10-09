import { useState, useEffect, useRef } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { api, API_BASE, type ApiError, type SetupSession, type SetupAvailability, type ConnectionInspection, type Domain } from '@/lib/api'
import type { PortalContext } from './Portal'
import {
  statusBadge, FULL_STACK_PHASES, componentHost, phaseIndex, useDomainInfo, vtaOnlyPhases,
} from './portalUtils'
import { PhaseStepper } from './PhaseStepper'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FullStackCreateProgress } from './FullStackCreateProgress'
import { ExternalDIDPublicationCard } from './ExternalDIDPublicationCard'
import { VtaConnectionCard } from './VtaConnectionCard'
import { VtaLimitDialog } from './VtaLimitDialog'
import { VTA_LIMIT_MESSAGE } from './vtaAccess'

type Stage = 0 | 1 | 2 | 3
type Mode = 'vta_only' | 'full_stack'

export function CreateVTAView() {
  const { loadSessions, sessionsLoading, sessionsError, fullstackAccess, vtaCount, vtaLimit } = useOutletContext<PortalContext>()
  const limitReached = vtaLimit !== null && vtaCount >= vtaLimit
  const [showLimitDialog, setShowLimitDialog] = useState(false)
  const [limitRejected, setLimitRejected] = useState(false)
  const navigate = useNavigate()

  const [stage, setStage] = useState<Stage>(0)
  const [selectedMode, setMode] = useState<Mode>('vta_only')
  const mode = stage === 0 && !fullstackAccess ? 'vta_only' : selectedMode
  const [connectionChoice, setConnectionChoice] = useState<'platform' | 'custom'>('platform')
  const [didHostingDid, setDidHostingDid] = useState('')
  const [mediatorDid, setMediatorDid] = useState('')
  const [validatedConnection, setValidatedConnection] = useState<{
    didHostingDid: string
    mediatorDid: string
    inspection: ConnectionInspection
  } | null>(null)
  const [inspectionError, setInspectionError] = useState('')
  const [inspecting, setInspecting] = useState(false)
  const domainInfo = useDomainInfo()
  const [availability, setAvailability] = useState<SetupAvailability | null>(null)
  const [vtaName, setVtaName] = useState('')
  const [images, setImages] = useState<Array<{ tag: string; image: string; latest?: boolean }>>([])
  const [selectedImage, setSelectedImage] = useState('')
  const [mediatorImages, setMediatorImages] = useState<Array<{ tag: string; image: string; latest?: boolean }>>([])
  const [selectedMediatorImage, setSelectedMediatorImage] = useState('')
  const [didsImages, setDidsImages] = useState<Array<{ tag: string; image: string; latest?: boolean }>>([])
  const [selectedDidsImage, setSelectedDidsImage] = useState('')
  const [vtcName, setVtcName] = useState('')
  const [vtcImages, setVtcImages] = useState<Array<{ tag: string; image: string; latest?: boolean }>>([])
  const [selectedVtcImage, setSelectedVtcImage] = useState('')
  // Custom domains the caller has attached. Empty when they have none — and
  // also when the API has the feature switched off, which 404s the list.
  const [domains, setDomains] = useState<Domain[]>([])
  // 'managed' or a domain id as a string; Select works in strings.
  const [domainChoice, setDomainChoice] = useState('managed')
  // On a fixed-label domain one label replaces both names — neither reaches a
  // hostname there, and their only surviving job is the did:webvh path.
  const [label, setLabel] = useState('myagent')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const logEndRef = useRef<HTMLDivElement>(null)
  const [liveSession, setLiveSession] = useState<SetupSession | null>(null)
  const [setupFailed, setSetupFailed] = useState(false)
  const [failedMsg, setFailedMsg] = useState('')
  const connectionInspection = validatedConnection?.didHostingDid === didHostingDid.trim() &&
    validatedConnection.mediatorDid === mediatorDid.trim() ? validatedConnection.inspection : null

  // Stage 1 setup-log streaming state
  const [setupStreamStarted, setSetupStreamStarted] = useState(false)
  const [setupLogsDone, setSetupLogsDone] = useState(false)

  // Stage 2 provisioning-log streaming state
  // Derived, not state: `stage` only ever advances (0→1→2→3), so this is
  // exactly "stage 2 has been reached". It was a useState set synchronously
  // inside the stage-2 effect, which is a render pass for a value already known.
  const provStreamStarted = stage >= 2 && !!sessionId

  useEffect(() => {
    api.listImages('vta')
      .then(imgs => {
        setImages(imgs)
        const latestImg = imgs.find(i => i.latest) ?? imgs[0]
        setSelectedImage(latestImg?.image ?? '')
      })
      .catch(() => {})
  }, [])

  // Remaining cluster capacity per mode, so we can show "Unavailable" and block
  // creation before the user submits. Fails open: on any error (or when the
  // backend can't measure) we leave the form enabled — POST /setup is the
  // authoritative gate and returns 503 if the cluster is truly full.
  useEffect(() => {
    api.setupAvailability().then(setAvailability).catch(() => {})
  }, [])

  // Lazily fetch mediator/dids images the first time a full-stack mode is selected.
  useEffect(() => {
    if (mode === 'vta_only' || mediatorImages.length > 0) return
    api.listImages('mediator')
      .then(imgs => {
        setMediatorImages(imgs)
        const latestImg = imgs.find(i => i.latest) ?? imgs[0]
        setSelectedMediatorImage(latestImg?.image ?? '')
      })
      .catch(() => {})
    api.listImages('dids')
      .then(imgs => {
        setDidsImages(imgs)
        const latestImg = imgs.find(i => i.latest) ?? imgs[0]
        setSelectedDidsImage(latestImg?.image ?? '')
      })
      .catch(() => {})
  }, [mode, mediatorImages.length])

  // The caller's domains, for the picker. Only full_stack can use one, so this
  // waits for that mode. On failure the picker shows managed alone, which is
  // the correct offer for someone with no verified domain anyway.
  const domainsLoaded = useRef(false)
  useEffect(() => {
    if (mode !== 'full_stack' || domainsLoaded.current) return
    domainsLoaded.current = true
    api.listDomains().then(setDomains).catch(() => {})
  }, [mode])

  // Lazily fetch vtc images the first time full_stack is selected.
  useEffect(() => {
    if (mode !== 'full_stack' || vtcImages.length > 0) return
    api.listImages('vtc')
      .then(imgs => {
        setVtcImages(imgs)
        const latestImg = imgs.find(i => i.latest) ?? imgs[0]
        setSelectedVtcImage(latestImg?.image ?? '')
      })
      .catch(() => {})
  }, [mode, vtcImages.length])

  // Stage 1: poll status; trigger setup log streaming when vta_setup_running
  useEffect(() => {
    if (stage !== 1 || !sessionId || setupFailed) return
    const check = (s: SetupSession) => {
      setLiveSession(s)
      if (s.status === 'failed') {
        setSetupFailed(true)
        setFailedMsg(s.error_msg ?? 'Setup failed')
        return
      }
      if (s.status === 'provisioning') {
        setLogs([])
        setStage(2)
        return
      }
      if (s.status === 'vta_setup_running') setSetupStreamStarted(true)
    }
    api.getSession(sessionId).then(check).catch(() => {})
    const iv = setInterval(() => api.getSession(sessionId).then(check).catch(() => {}), 3000)
    return () => clearInterval(iv)
  }, [stage, sessionId, setupFailed])

  // Stage 1: stream setup logs; 2s timer starts only after 'done' event
  useEffect(() => {
    if (!setupStreamStarted || !sessionId) return
    // Clear when the stream actually opens rather than up front: the previous
    // step's output stays on screen through the reconnect instead of blanking,
    // and the setState leaves the effect body (react-hooks/set-state-in-effect).
    let cleared = false
    const clearOnce = () => { if (!cleared) { cleared = true; setLogs([]) } }
    let hasLog = false
    let advanceTimer: ReturnType<typeof setTimeout> | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let es: EventSource | null = null
    let cancelled = false

    const scheduleAdvance = () => { if (!advanceTimer) advanceTimer = setTimeout(() => setSetupLogsDone(true), 2000) }

    const connect = () => {
      if (cancelled) return
      es = new EventSource(`${API_BASE}/api/v1/setup/${sessionId}/logs?source=setup`, { withCredentials: true })
      es.onopen = clearOnce
      es.onmessage = e => {
        clearOnce()
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
    if (liveSession?.status !== 'vta_setup_complete' && liveSession?.status !== 'awaiting_did_publication') return
    const t = setTimeout(() => setSetupLogsDone(true), 60000)
    return () => clearTimeout(t)
  }, [setupStreamStarted, setupLogsDone, liveSession?.status])

  // Stage 2: poll status to detect failure
  useEffect(() => {
    if (stage !== 2 || !sessionId || setupFailed) return
    const check = (s: SetupSession) => {
      setLiveSession(s)
      if (s.status === 'failed') {
        setSetupFailed(true)
        setFailedMsg(s.error_msg ?? 'Provisioning failed')
      } else if (s.status === 'running') {
        setStage(3)
      }
    }
    api.getSession(sessionId).then(check).catch(() => {})
    const iv = setInterval(() => api.getSession(sessionId).then(check).catch(() => {}), 3000)
    return () => clearInterval(iv)
  }, [stage, sessionId, setupFailed])

  // Stage 2: stream provision logs immediately. The job can finish before the
  // deployment is ready, so only the session-status poll advances to stage 3.
  useEffect(() => {
    if (stage !== 2 || !sessionId) return
    let hasLog = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let es: EventSource | null = null
    let cancelled = false

    const connect = () => {
      if (cancelled) return
      es = new EventSource(`${API_BASE}/api/v1/setup/${sessionId}/logs?source=provision`, { withCredentials: true })
      es.onmessage = e => {
        setLogs(prev => [...prev, e.data])
        hasLog = true
      }
      es.addEventListener('done', () => es!.close())
      es.onerror = () => {
        es!.close()
        if (!hasLog) retryTimer = setTimeout(connect, 4000)
      }
    }
    connect()
    return () => {
      cancelled = true
      es?.close()
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [stage, sessionId])

  // Stage 3: stream live VTA logs
  useEffect(() => {
    if (stage !== 3 || !sessionId) return
    // Clear when the stream actually opens rather than up front: the previous
    // step's output stays on screen through the reconnect instead of blanking,
    // and the setState leaves the effect body (react-hooks/set-state-in-effect).
    let cleared = false
    const clearOnce = () => { if (!cleared) { cleared = true; setLogs([]) } }
    const es = new EventSource(`${API_BASE}/api/v1/setup/${sessionId}/logs?source=vta`, { withCredentials: true })
    es.onopen = clearOnce
    es.onmessage = e => { clearOnce(); setLogs(prev => [...prev, e.data]) }
    es.addEventListener('done', () => es.close())
    es.onerror = () => es.close()
    return () => es.close()
  }, [stage, sessionId])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // Only full_stack can run on a custom domain; switching back to vta_only
  // must not leave a stale selection armed.
  const selectedDomain = mode === 'full_stack' && domainChoice !== 'managed'
    ? domains.find(d => String(d.id) === domainChoice) ?? null
    : null

  async function handleCreate() {
    if (sessionsLoading || sessionsError) return
    if (limitReached) { setShowLimitDialog(true); return }
    if (mode === 'full_stack' && !fullstackAccess) {
      setCreateError('Full Stack creation requires Fullstack Access.')
      return
    }
    if (!selectedDomain && !vtaName) { setCreateError('Enter an agent name'); return }
    if (mode === 'full_stack' && !selectedDomain && !vtcName) { setCreateError('Enter a community name'); return }
    if (!selectedImage) { setCreateError('Select a VTA image'); return }
    if (mode !== 'vta_only' && (!selectedMediatorImage || !selectedDidsImage)) {
      setCreateError('Select a mediator and DID hosting image'); return
    }
    if (mode === 'full_stack' && !selectedVtcImage) {
      setCreateError('Select a VTC image'); return
    }
    if (mode === 'vta_only' && connectionChoice === 'custom' && !connectionInspection) {
      setCreateError('Validate the DID connection before creating the session'); return
    }
    setCreateError(''); setCreating(true)
    try {
      const r = await api.createSession({
        mode,
        vta_image: selectedImage,
        // vta_name/vtc_name and label are mutually exclusive: on a custom
        // domain the hostnames are fixed, so neither name means anything.
        ...(selectedDomain
          ? { domain_id: selectedDomain.id, label }
          : { vta_name: vtaName }),
        ...(mode !== 'vta_only' ? { mediator_image: selectedMediatorImage, dids_image: selectedDidsImage } : {}),
        ...(mode === 'full_stack' ? { vtc_image: selectedVtcImage } : {}),
        ...(mode === 'full_stack' && !selectedDomain ? { vtc_name: vtcName } : {}),
        ...(mode === 'vta_only' && connectionChoice === 'custom'
          ? { did_hosting_did: didHostingDid.trim(), mediator_did: mediatorDid.trim() }
          : {}),
      })
      setSessionId(r.id)
      setStage(1)
      loadSessions()
    } catch (err) {
      if ((err as ApiError).reason === 'vta_limit_reached') {
        setLimitRejected(true)
        setShowLimitDialog(true)
        loadSessions()
      } else {
        setCreateError(err instanceof Error ? err.message : 'Failed to create session')
        if ((err as ApiError).reason === 'fullstack_access_required') loadSessions()
      }
    } finally {
      setCreating(false)
    }
  }

  async function handleInspectConnection() {
    setInspectionError('')
    setValidatedConnection(null)
    setInspecting(true)
    const hostingDID = didHostingDid.trim()
    const mediatorDID = mediatorDid.trim()
    try {
      const inspection = await api.inspectConnection(hostingDID, mediatorDID)
      setValidatedConnection({ didHostingDid: hostingDID, mediatorDid: mediatorDID, inspection })
    } catch (err) {
      setInspectionError(err instanceof Error ? err.message : 'Could not validate the DID connection')
    } finally {
      setInspecting(false)
    }
  }

  function handleDone() {
    loadSessions()
    navigate('/portal')
  }

  const externalFlow = connectionInspection?.manual_publication || liveSession?.connection_source === 'external'
  const vtaPhases = vtaOnlyPhases(externalFlow)
  const stageProgressStatus = stage === 3
    ? 'running'
    : stage === 2
      ? 'provisioning'
      : liveSession?.status
  const progressStatus = setupFailed
    ? liveSession?.failed_stage ?? stageProgressStatus
    : stageProgressStatus
  const progressIndex = phaseIndex(vtaPhases, progressStatus)
  const currentStep = stage === 0 ? 0 : progressIndex >= 0 ? progressIndex : 1

  // Live hostname previews. Managed domains carry the user-chosen name in the
  // label, so these track what's typed; an empty field keeps the <name>
  // placeholder these hints used to hardcode. Null until domain-info resolves —
  // the hint then renders without a hostname rather than with a guessed one.
  const fixedLabels = selectedDomain !== null
  const hostOpts = { fixedLabels, domain: selectedDomain?.domain }
  const vtaHost = domainInfo && componentHost(domainInfo, 'vta', { ...hostOpts, name: vtaName || '<name>' })
  const vtcHost = domainInfo && componentHost(domainInfo, 'vtc', { ...hostOpts, name: vtcName || '<name>' })
  const didsHost = domainInfo && componentHost(domainInfo, 'dids', hostOpts)

  // A verified domain that no session is running on. One domain backs one
  // session, because its four labels are fixed.
  const selectableDomains = domains.filter(d => d.verified)

  // The backend already folds capacity (fail-open) and the platform-stack
  // prerequisite (hard) into one `available`, and says which applies — so the
  // screen reads one field and shows the server's own sentence rather than
  // guessing at a reason.
  const modeAvailability = availability?.[mode]
  const customAtCapacity = mode === 'vta_only' && connectionChoice === 'custom' &&
    modeAvailability?.custom_target_allowed === false
  const modeUnavailable = modeAvailability
    ? mode === 'vta_only' && connectionChoice === 'custom'
      ? customAtCapacity
      : !modeAvailability.available
    : false
  const showingSetupLogs = stage === 1 && setupStreamStarted && !setupLogsDone
  // Only use status as fallback when we never entered the log-streaming phase
  const showDIDForm = stage === 1 && liveSession?.status === 'vta_setup_complete' &&
    (setupLogsDone || !setupStreamStarted)
  const showPublicationForm = stage === 1 && liveSession?.status === 'awaiting_did_publication' &&
    (setupLogsDone || !setupStreamStarted)
  const terminalLabel = `vtafarm · setup --follow ${vtaName}`

  if (stage === 0 && !limitRejected && (sessionsLoading || sessionsError || limitReached)) return (
    <section className="p-content">
      <div className="page-head"><h1>Create a Trust Agent</h1></div>
      {sessionsLoading ? <p>Loading VTA usage…</p> : (
        <div className="p-card">
          <div className="card-header">
            <h3 className="card-title">{sessionsError ? 'VTA usage unavailable' : 'VTA limit reached'}</h3>
            <p className="card-desc">{sessionsError || VTA_LIMIT_MESSAGE}</p>
          </div>
          <div className="card-footer">
            {sessionsError && <button className="btn btn-outline" onClick={loadSessions}>Refresh</button>}
            <button className="btn btn-default" onClick={() => navigate('/portal')}>Back to Your Trust Agents</button>
          </div>
        </div>
      )}
      <VtaLimitDialog open={showLimitDialog} onOpenChange={setShowLimitDialog} />
    </section>
  )

  return (
    <section className="p-content">
      <div className="page-head">
        <div>
          <h1>Create a Trust Agent</h1>
          {stage === 0 && sessionsError && <p className="vta-usage">
            {sessionsError}
          </p>}
        </div>
      </div>

      {/* Stepper — full_stack renders its own live one inside FullStackCreateProgress once a session exists */}
      {mode === 'vta_only' ? (
        <PhaseStepper
          phases={vtaPhases}
          currentIndex={currentStep}
          failed={setupFailed}
          spinning={stage !== 0}
        />
      ) : stage === 0 && (
        <PhaseStepper phases={FULL_STACK_PHASES} currentIndex={0} spinning={false} />
      )}

      {/* Stage 0 */}
      {stage === 0 && (
        <div className="p-card">
          <div className="card-header">
            <h3 className="card-title">Create your own Trust Agent or VTC</h3>
            <p className="card-desc">{fullstackAccess ? 'Choose an option, name your agent and select the image to use.' : 'Name your agent and select the images to provision.'}</p>
          </div>
          <div className="card-content p-col gap-16">
            {modeUnavailable && (
              <div className="p-alert alert-warning">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
                <div className="grow">
                  <p className="alert-title">
                    {mode === 'vta_only' && !customAtCapacity && modeAvailability?.reason?.startsWith('platform_stack') ? 'Not ready yet' : 'Unavailable'}
                  </p>
                  <p className="alert-desc">
                    {!customAtCapacity && modeAvailability?.detail ? modeAvailability.detail : (
                      <>
                        The cluster is currently at capacity and can't provision a new{' '}
                        {mode === 'vta_only' ? 'VTA' : 'Full Stack'} agent right now. Please try again later or contact an admin.
                      </>
                    )}
                  </p>
                </div>
              </div>
            )}
            {fullstackAccess && <div>
              <div className="p-label">Options <span className="req">*</span></div>
              <div className="p-tabs full">
                <button type="button" className="p-tab" data-active={mode === 'vta_only'} onClick={() => setMode('vta_only')}>Personal Trust Agent</button>
                <button type="button" className="p-tab" data-active={mode === 'full_stack'} onClick={() => setMode('full_stack')}>Verifiable Trust Community (VTC)</button>
              </div>
            </div>}

            {mode === 'vta_only' && (
              <div className="p-col gap-12">
                <div>
                  <div className="p-label">Connect to <span className="req">*</span></div>
                  <div className="p-tabs full">
                    <button type="button" className="p-tab" data-active={connectionChoice === 'platform'} onClick={() => setConnectionChoice('platform')}>VTA Farm&rsquo;s messaging service</button>
                    <button type="button" className="p-tab" data-active={connectionChoice === 'custom'} onClick={() => setConnectionChoice('custom')}>Another messaging service</button>
                  </div>
                </div>
                {connectionChoice === 'custom' && (
                  <>
                    <div className="field-hint">Enter the mediator DID and DID hosting daemon DID, then validate the connection to enable session creation. Farm-managed hosting publishes your VTA DID automatically; external hosting requires you to upload its DID log.</div>
                    <div>
                      <label className="p-label" htmlFor="cv-mediator-did">Mediator DID <span className="req">*</span></label>
                      <input className="p-input p-mono" id="cv-mediator-did" type="text" placeholder="did:webvh:…" value={mediatorDid}
                        onChange={e => { setMediatorDid(e.target.value); setValidatedConnection(null); setInspectionError('') }} />
                    </div>
                    <div>
                      <label className="p-label" htmlFor="cv-did-hosting-did">DID Hosting DID <span className="req">*</span></label>
                      <input className="p-input p-mono" id="cv-did-hosting-did" type="text" placeholder="did:webvh:…" value={didHostingDid}
                        onChange={e => { setDidHostingDid(e.target.value); setValidatedConnection(null); setInspectionError('') }} />
                    </div>
                    <div>
                      <button className="btn btn-outline btn-sm" type="button" onClick={handleInspectConnection}
                        disabled={inspecting || !didHostingDid.trim() || !mediatorDid.trim()}>
                        {inspecting ? 'Checking…' : 'Validate connection'}
                      </button>
                    </div>
                    {inspectionError && <p className="text-sm" style={{ color: 'hsl(var(--destructive))', margin: 0 }}>{inspectionError}</p>}
                    {connectionInspection && (
                      <div className="p-alert alert-success">
                        <div className="grow">
                          <p className="alert-title">{connectionInspection.manual_publication ? 'External DID hosting' : 'Farm-managed DID hosting'}</p>
                          <p className="alert-desc">
                            {connectionInspection.manual_publication
                              ? 'After VTA setup, download its did.jsonl, upload it to your DID hosting, and validate publication here.'
                              : 'VTA Farm will upload the VTA DID log automatically.'}
                          </p>
                          <p className="p-mono text-xs" style={{ wordBreak: 'break-all', marginBottom: 0 }}>{connectionInspection.did_hosting_url}</p>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {mode === 'full_stack' && (
              <div>
                <label className="p-label" htmlFor="cv-domain">Domain</label>
                <Select value={domainChoice} onValueChange={setDomainChoice}>
                  <SelectTrigger className="w-full" id="cv-domain">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="managed">
                      Managed{domainInfo ? ` — ${domainInfo.managed_domain}` : ''}
                    </SelectItem>
                    {selectableDomains.map(d => (
                      <SelectItem key={d.id} value={String(d.id)} disabled={!!d.in_use_by} className="p-mono">
                        {d.domain}{d.in_use_by ? ' (in use by another agent)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Shown even with nothing to pick — it's the only place the
                    feature is discoverable from. */}
                <div className="field-hint">
                  {selectableDomains.length === 0 ? (
                    <>
                      Own a domain?{' '}
                      <button type="button" className="btn btn-ghost btn-sm" style={{ padding: 0, height: 'auto' }}
                        onClick={() => navigate('/portal/domains')}>
                        Attach it under Domains
                      </button>
                      {' '}to run this VTC under your own domain.
                    </>
                  ) : selectedDomain ? (
                    <>Your agent gets fixed hostnames under <span className="p-mono">{selectedDomain.domain}</span>.</>
                  ) : (
                    'Hostnames are generated from the names below, in the VTA Farm zone.'
                  )}
                </div>
              </div>
            )}

            {selectedDomain && (
              <div className="p-alert alert-warning">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
                <div className="grow">
                  <p className="alert-title">This can't be changed later</p>
                  <p className="alert-desc">
                    Your agent's DIDs permanently embed{' '}
                    <span className="p-mono">{didsHost ?? `dids.${selectedDomain.domain}`}</span>, and
                    third parties resolve them from there. Moving to a different domain means
                    creating a new agent from scratch.
                  </p>
                </div>
              </div>
            )}

            <div className="p-section-title" style={{ marginTop: 4 }}>Agent setup</div>
            {selectedDomain ? (
              <div>
                <label className="p-label" htmlFor="cv-label">Label <span className="req">*</span></label>
                <div className="input-group">
                  <svg className="ig-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>
                  <input className="p-input p-mono" id="cv-label" type="text" value={label}
                    onChange={e => setLabel(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} />
                </div>
                {/* No "must be unique" here: on a custom domain the label reaches
                    no hostname, so duplicates across accounts are fine and a
                    conflict would be a bug, not user error. */}
                <div className="field-hint">
                  Just for you — it identifies this agent in your list and appears in its
                  DID paths.
                </div>
              </div>
            ) : (
              <div>
                <label className="p-label" htmlFor="cv-name">Agent name <span className="req">*</span></label>
                <div className="input-group">
                  <svg className="ig-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>
                  <input className="p-input p-mono" id="cv-name" type="text" placeholder="my-agent" value={vtaName}
                    onChange={e => setVtaName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} />
                </div>
                <div className="field-hint">
                  Must be unique.{vtaHost && <> Your agent will live at{' '}
                  <span className="p-mono">{vtaHost}</span>.</>}
                </div>
              </div>
            )}
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
              <div className="field-hint">Stay with the default 'latest' image unless you have been told otherwise.</div>
            </div>
            {mode !== 'vta_only' && (
              <>
                <div>
                  <label className="p-label" htmlFor="cv-mediator-image">Mediator Image <span className="req">*</span></label>
                  {mediatorImages.length > 0 ? (
                    <Select value={selectedMediatorImage} onValueChange={setSelectedMediatorImage}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {mediatorImages.map(img => (
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
                <div>
                  <label className="p-label" htmlFor="cv-dids-image">DID Hosting Image <span className="req">*</span></label>
                  {didsImages.length > 0 ? (
                    <Select value={selectedDidsImage} onValueChange={setSelectedDidsImage}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {didsImages.map(img => (
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
              </>
            )}
            {mode === 'full_stack' && (
              <>
                <hr className="p-sep" style={{ marginTop: 12, marginBottom: 8 }} />
                <div className="p-section-title">Community setup</div>
                {/* On a custom domain the community's hostname is fixed too, so
                    the single label above already covers it. */}
                {!selectedDomain && (
                  <div>
                    <label className="p-label" htmlFor="cv-vtc-name">Community name <span className="req">*</span></label>
                    <div className="input-group">
                      <svg className="ig-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                      <input className="p-input p-mono" id="cv-vtc-name" type="text" placeholder="my-vtc" value={vtcName}
                        onChange={e => setVtcName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} />
                    </div>
                    <div className="field-hint">
                      Must be unique.{vtcHost && <> Your community will live at{' '}
                      <span className="p-mono">{vtcHost}</span>.</>}
                    </div>
                  </div>
                )}
                {selectedDomain && vtcHost && (
                  <div className="field-hint" style={{ marginTop: 0 }}>
                    Your community will live at <span className="p-mono">{vtcHost}</span>.
                  </div>
                )}
                <div>
                  <label className="p-label" htmlFor="cv-vtc-image">VTC Image <span className="req">*</span></label>
                  {vtcImages.length > 0 ? (
                    <Select value={selectedVtcImage} onValueChange={setSelectedVtcImage}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {vtcImages.map(img => (
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
              </>
            )}
            {createError && <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{createError}</p>}
            {limitReached && <p className="field-hint">{VTA_LIMIT_MESSAGE}</p>}
            {!fullstackAccess && <p className="field-hint">All undeleted agents count toward your limit, including those being set up or in a failed state. Delete a failed agent to free up a slot.</p>}
          </div>
          <div className="card-footer between">
            <span className="field-hint" style={{ marginTop: 0 }}>
              {selectedDomain
                ? 'Your domain is already verified — provisioning starts right away.'
                : mode === 'full_stack'
                  ? '4 DNS records are created immediately after session creation.'
                  : ''}
            </span>
            <button className="btn btn-default" onClick={handleCreate}
              disabled={creating || sessionsLoading || !!sessionsError || limitReached || (mode === 'full_stack' && !fullstackAccess) || modeUnavailable || (mode === 'vta_only' && connectionChoice === 'custom' && !connectionInspection)}>
              {creating ? 'Creating…' : limitReached ? 'Limit reached' : modeUnavailable ? 'Unavailable' : <>Create session <span className="arrow">→</span></>}
            </button>
          </div>
        </div>
      )}

      {/* full_stack progress — owns everything after session creation for that mode */}
      {mode === 'full_stack' && stage === 1 && sessionId && (
        <FullStackCreateProgress sessionId={sessionId} vtaName={selectedDomain ? label : vtaName} />
      )}

      {/* Failure state (vta_only) */}
      {mode === 'vta_only' && setupFailed && (
        <>
          <div className="p-alert alert-destructive" style={{ marginBottom: 16 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12"/></svg>
            <div className="grow">
              <p className="alert-title">Setup failed</p>
              <p className="alert-desc">{failedMsg || 'An error occurred. Please delete this agent and try again.'}</p>
            </div>
          </div>
          <div className="p-card">
            <div className="card-footer between">
              <span className="field-hint" style={{ marginTop: 0 }}>Delete this agent to release resources, then create a new one.</span>
              <div className="p-row gap-12">
                <button className="btn btn-ghost" onClick={handleDone}>Back to Agents</button>
                {sessionId && (
                  <button className="btn btn-destructive" onClick={() => navigate(`/portal/session/${sessionId}`)}>
                    Delete agent <span className="arrow">→</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Stage 1 (vta_only) */}
      {mode === 'vta_only' && !setupFailed && stage === 1 && sessionId && (
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

          {showPublicationForm && liveSession ? (
            <ExternalDIDPublicationCard session={liveSession} onValidated={() => {
              api.getSession(sessionId).then(setLiveSession).catch(() => {})
            }} />
          ) : showDIDForm ? (
            /* vta_setup_complete — ready for admin DID */
            liveSession?.vta_did ? (
              <VtaConnectionCard
                session={liveSession}
                sessionId={sessionId}
                vtaDid={liveSession.vta_did}
                ready
                onSessionChange={setLiveSession}
              />
            ) : null
          ) : showingSetupLogs ? (
            /* Streaming setup logs */
            <div className="p-card">
              <div className="card-header">
                <div>
                  <h3 className="card-title">VTA setup running</h3>
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
              <div className="card-header">
                <div>
                  <h3 className="card-title">VTA setup in progress</h3>
                  <p className="card-desc">VTA Farm is preparing the VTA environment. This usually takes a minute.</p>
                </div>
              </div>
              <div className="card-content">
                <div className="p-console">
                  <div className="console-head">
                    <div className="dots"><span/><span/><span/></div>
                    <span className="p-mono">{terminalLabel}</span>
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

      {/* Stage 2 (vta_only) */}
      {mode === 'vta_only' && !setupFailed && stage === 2 && (
        <div className="p-card">
          <div className="card-header">
            <div><h3 className="card-title">Provisioning your Trust Agent</h3><p className="card-desc">VTA Farm is bringing <span className="p-mono">{vtaName}</span> online.</p></div>
          </div>
          <div className="card-content">
            <div className="p-console">
              <div className="console-head">
                <div className="dots"><span/><span/><span/></div>
                <span className="p-mono">{terminalLabel}</span>
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

      {/* Stage 3 (vta_only) */}
      {mode === 'vta_only' && !setupFailed && stage === 3 && (
        <>
          <div className="p-alert alert-success" style={{ marginBottom: 16 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z"/><path d="m9 12 2 2 4-4"/></svg>
            <div className="grow">
              <p className="alert-title">Your Trust Agent is now online</p>
              <p className="alert-desc"><span className="p-mono">{vtaName}</span> is provisioned and running.</p>
            </div>
          </div>
          <div className="p-card" style={{ marginBottom: 16 }}>
            <div className="card-content" style={{ padding: 0 }}>
              <div className="p-console">
                <div className="console-head">
                  <div className="dots"><span/><span/><span/></div>
                  <span className="p-mono">{terminalLabel}</span>
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
      <VtaLimitDialog open={showLimitDialog} onOpenChange={setShowLimitDialog} />
    </section>
  )
}
