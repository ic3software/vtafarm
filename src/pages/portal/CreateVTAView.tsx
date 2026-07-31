import { useState, useEffect, useRef } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { api, API_BASE, type SetupSession, type SetupAvailability, type Domain } from '@/lib/api'
import type { PortalContext } from './Portal'
import {
  statusBadge, FULL_STACK_PHASES, isValidAdminDid, componentHost, useDomainInfo,
  parseConnectionBundle, connectionRefusalMessage,
} from './portalUtils'
import type { StackConnection } from '@/lib/api'
import { PhaseStepper } from './PhaseStepper'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FullStackCreateProgress } from './FullStackCreateProgress'

type Stage = 0 | 1 | 2 | 3
type Mode = 'vta_only' | 'full_stack'

export function CreateVTAView() {
  // betaAccess comes from the portal shell, which already reads it fresh from
  // the DB — the JWT doesn't carry it, and an admin can flip it at any time.
  const { loadSessions, betaAccess } = useOutletContext<PortalContext>()
  const navigate = useNavigate()

  const [stage, setStage] = useState<Stage>(0)
  const [mode, setMode] = useState<Mode>('vta_only')
  const domainInfo = useDomainInfo()
  const [availability, setAvailability] = useState<SetupAvailability | null>(null)
  const [vtaName, setVtaName] = useState('myvta')
  const [images, setImages] = useState<Array<{ tag: string; image: string; latest?: boolean }>>([])
  const [selectedImage, setSelectedImage] = useState('')
  const [mediatorImages, setMediatorImages] = useState<Array<{ tag: string; image: string; latest?: boolean }>>([])
  const [selectedMediatorImage, setSelectedMediatorImage] = useState('')
  const [didsImages, setDidsImages] = useState<Array<{ tag: string; image: string; latest?: boolean }>>([])
  const [selectedDidsImage, setSelectedDidsImage] = useState('')
  const [vtcName, setVtcName] = useState('myvtc')
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
  // Which stack a VTA-only agent connects to. 'platform' is the default and
  // today's behaviour; 'custom' points it at a stack somebody shared.
  const [target, setTarget] = useState<'platform' | 'custom'>('platform')
  const [bundleText, setBundleText] = useState('')
  const [bundle, setBundle] = useState<StackConnection | null>(null)
  const [bundleError, setBundleError] = useState('')
  const [checking, setChecking] = useState(false)
  // Rendered from the SERVER's answer, never from the pasted text — see the
  // comment on checkBundle.
  const [confirmed, setConfirmed] = useState<{
    stack: string; farm: string; mediator_did: string; did_hosting_server_url: string
    connections_used?: number; connections_max?: number
  } | null>(null)
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
  const [setupFailed, setSetupFailed] = useState(false)
  const [failedMsg, setFailedMsg] = useState('')

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
      if (s.status === 'failed') {
        setSetupFailed(true)
        setFailedMsg(s.error_msg ?? 'Setup failed')
        return
      }
      setLiveSession(s)
      if (s.status === 'vta_setup_running') setSetupStreamStarted(true)
    }
    api.getSession(sessionId).then(check).catch(() => {})
    const iv = setInterval(() => api.getSession(sessionId).then(check).catch(() => {}), 3000)
    return () => clearInterval(iv)
  }, [stage, sessionId, setupFailed])

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
    if (stage !== 2 || !sessionId || setupFailed) return
    const check = (s: SetupSession) => {
      if (s.status === 'failed') {
        setSetupFailed(true)
        setFailedMsg(s.error_msg ?? 'Provisioning failed')
      }
    }
    const iv = setInterval(() => api.getSession(sessionId).then(check).catch(() => {}), 3000)
    return () => clearInterval(iv)
  }, [stage, sessionId, setupFailed])

  // Stage 2: stream provision logs immediately; advance 2s after 'done' event
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
      es = new EventSource(`${API_BASE}/api/v1/setup/${sessionId}/logs?source=provision`, { withCredentials: true })
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

  // Only full_stack can run on a custom domain; switching back to vta_only
  // must not leave a stale selection armed.
  const selectedDomain = mode === 'full_stack' && domainChoice !== 'managed'
    ? domains.find(d => String(d.id) === domainChoice) ?? null
    : null

  /**
   * Parses the pasted text locally, then asks the server to confirm it.
   *
   * The second step is not optional. Every field in the bundle came out of the
   * pasted text, so a confirmation card built from it would show a confident
   * "connecting to alice" for a bundle whose code is pure garbage — and the
   * user would find out only after naming their agent, choosing an image and
   * pressing Create. The card's whole job is to be true at the moment it is
   * shown, so its values come from the server or it does not appear.
   */
  async function checkBundle(text: string) {
    setConfirmed(null)
    setBundle(null)
    const parsed = parseConnectionBundle(text)
    if (!parsed.ok) { setBundleError(parsed.error); return }

    setBundle(parsed.bundle)
    setBundleError('')
    setChecking(true)
    try {
      setConfirmed(await api.validateConnection(parsed.bundle))
    } catch (err) {
      const reason = (err as { reason?: string })?.reason
      setBundleError(connectionRefusalMessage(
        reason,
        err instanceof Error ? err.message : 'Could not check that bundle',
      ))
    } finally {
      setChecking(false)
    }
  }

  async function handleCreate() {
    if (!selectedImage) { setCreateError('Select a VTA image'); return }
    if (mode === 'vta_only' && target === 'custom' && !confirmed) {
      setCreateError('Paste a connection bundle for the stack you want to use'); return
    }
    if (mode !== 'vta_only' && (!selectedMediatorImage || !selectedDidsImage)) {
      setCreateError('Select a mediator and DID hosting image'); return
    }
    if (mode === 'full_stack' && !selectedVtcImage) {
      setCreateError('Select a VTC image'); return
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
        ...(mode === 'vta_only' && target === 'custom' && bundle ? { connection: bundle } : {}),
      })
      setSessionId(r.id)
      setStage(1)
    } catch (err) {
      // Create re-runs every check validate ran: the stack can stop running,
      // rotate its code or fill up in between, so the same mapping has to be
      // wired to both.
      const reason = (err as { reason?: string })?.reason
      setCreateError(connectionRefusalMessage(
        reason,
        err instanceof Error ? err.message : 'Failed to create session',
      ))
    } finally {
      setCreating(false)
    }
  }

  async function handleProvision() {
    const trimmed = adminDid.trim()
    if (!trimmed) { setProvisionError('Enter the admin DID from pnm'); return }
    if (!isValidAdminDid(trimmed)) {
      setProvisionError('Invalid did:key — make sure you copied only the did:key value (e.g. did:key:z6Mk…) with no surrounding text, labels, quotes, or whitespace.')
      return
    }
    if (!sessionId) return
    setProvisionError(''); setProvisioning(true)
    try {
      await api.provisionAdmin(sessionId, trimmed)
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
  const blockedOnPlatformStack = modeAvailability?.reason?.startsWith('platform_stack') === true ||
    modeAvailability?.reason === 'shared_infra_unconfigured'
  // `available` describes the DEFAULT path only. A VTA-only agent pointed at a
  // stack somebody shared needs no platform stack at all, so a missing one
  // disables that one option rather than the whole mode — the platform stack is
  // a default, not a prerequisite.
  const platformTargetBlocked = mode === 'vta_only' && blockedOnPlatformStack
  const modeUnavailable = modeAvailability
    ? mode === 'vta_only'
      ? !modeAvailability.available && !(modeAvailability.custom_target_allowed && target === 'custom')
      : !modeAvailability.available
    : false

  // When the default path is closed but Customize is open, select it: the only
  // working path should not also be the one the user has to go find.
  const [autoTargeted, setAutoTargeted] = useState(false)
  if (!autoTargeted && platformTargetBlocked && modeAvailability?.custom_target_allowed) {
    setAutoTargeted(true)
    setTarget('custom')
  }

  const showingSetupLogs = stage === 1 && setupStreamStarted && !setupLogsDone
  // Only use status as fallback when we never entered the log-streaming phase
  const showDIDForm = stage === 1 && (
    setupLogsDone ||
    (!setupStreamStarted && liveSession?.status === 'vta_setup_complete')
  )

  return (
    <section className="p-content">
      <div className="page-head">
        <div>
          <h1>Create a Verifiable Trust Agent</h1>
          <p className="sub">Configure your VTA session — VTA Farm provisions the agent online.</p>
        </div>
        <button className="btn btn-outline" onClick={handleDone}>Cancel</button>
      </div>

      {/* Stepper — full_stack renders its own live one inside FullStackCreateProgress once a session exists */}
      {mode === 'vta_only' ? (
      <div className="p-card" style={{ marginBottom: 20 }}>
        <div className="card-content" style={{ padding: '26px 28px 22px' }}>
          <div className="stepper">
            {(['Create session', 'DNS & environment', 'VTA setup', 'Admin DID', 'Deploy VTA', 'Running'] as const).map((label, i) => {
              const s = i < currentStep ? 'done' : i === currentStep ? 'active' : ''
              const isFailed = setupFailed && i === currentStep
              const spinning = !setupFailed && i === currentStep && (stage === 2 || showingSetupLogs)
              return (
                <div key={i} className={`step ${isFailed ? 'failed' : s}`}>
                  <div className="bar" />
                  <div className="node">
                    {i < currentStep ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path d="M20 6 9 17l-5-5"/></svg>
                    ) : isFailed ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M18 6 6 18M6 6l12 12"/></svg>
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
      ) : stage === 0 && (
        <PhaseStepper phases={FULL_STACK_PHASES} currentIndex={0} spinning={false} />
      )}

      {/* Stage 0 */}
      {stage === 0 && (
        <div className="p-card">
          <div className="card-header">
            <h3 className="card-title">Create a session</h3>
            <p className="card-desc">Name your agent, choose a mode, and select the images to provision.</p>
          </div>
          <div className="card-content p-col gap-16">
            {modeUnavailable && (
              <div className="p-alert alert-warning">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
                <div className="grow">
                  <p className="alert-title">
                    {blockedOnPlatformStack ? 'Not ready yet' : 'Unavailable'}
                  </p>
                  <p className="alert-desc">
                    {modeAvailability?.detail ?? (
                      <>
                        The cluster is currently at capacity and can't provision a new{' '}
                        {mode === 'vta_only' ? 'VTA' : 'Full Stack'} agent right now. Please try again later or contact an admin.
                      </>
                    )}
                    {/* A VTA-only user whose only blocker is the missing shared
                        infrastructure can't do anything about it themselves.
                        Connecting to a stack somebody shared is the direct way
                        out and needs no beta access, so it comes first; Full
                        Stack is the fallback, and only when they can pick it. */}
                    {blockedOnPlatformStack && mode === 'vta_only' && (
                      <>
                        {' '}If someone has shared a stack with you, choose <strong>Customize</strong> above
                        and paste their connection bundle — that doesn't depend on the platform stack.
                        {betaAccess && availability?.full_stack.available && (
                          <> A Full Stack agent runs its own mediator and DID hosting, so it can also be created now.</>
                        )}
                      </>
                    )}
                  </p>
                </div>
              </div>
            )}
            <div>
              <div className="p-label">Mode <span className="req">*</span></div>
              {betaAccess ? (
                <div className="p-tabs full">
                  <button type="button" className="p-tab" data-active={mode === 'vta_only'} onClick={() => setMode('vta_only')}>VTA Only</button>
                  <button type="button" className="p-tab" data-active={mode === 'full_stack'} onClick={() => setMode('full_stack')}>Full Stack</button>
                </div>
              ) : (
                <span className="p-badge badge-secondary">VTA Only</span>
              )}
              <div className="field-hint">
                {mode === 'vta_only'
                  ? 'Deploys just the VTA, pointed at a shared external mediator and DID hosting service.'
                  : 'Deploys a dedicated VTA + DIDComm Mediator + WebVH DID Hosting daemon + Verifiable Trust Community just for you.'}
              </div>
            </div>

            {/* Which stack this agent connects to. Placed above the name and
                image fields because it changes what the rest of the form means. */}
            {mode === 'vta_only' && (
              <div>
                <div className="p-label">Connect to <span className="req">*</span></div>
                <div className="p-tabs full">
                  <button
                    type="button"
                    className="p-tab"
                    data-active={target === 'platform'}
                    disabled={platformTargetBlocked}
                    style={platformTargetBlocked ? { opacity: .55, cursor: 'not-allowed' } : undefined}
                    onClick={() => setTarget('platform')}
                  >
                    Platform stack
                  </button>
                  <button type="button" className="p-tab" data-active={target === 'custom'} onClick={() => setTarget('custom')}>
                    Customize
                  </button>
                </div>
                <div className="field-hint">
                  {target === 'platform'
                    ? platformTargetBlocked
                      ? "The shared mediator and DID hosting aren't available — paste a bundle for a stack somebody shared with you instead."
                      : 'Uses the shared mediator and DID hosting this farm runs.'
                    : 'Uses a Full Stack somebody else runs here and shared with you.'}
                </div>
              </div>
            )}

            {mode === 'vta_only' && target === 'custom' && (
              <div>
                <label className="p-label" htmlFor="cv-bundle">Connection bundle <span className="req">*</span></label>
                <textarea
                  id="cv-bundle"
                  className="p-input p-mono"
                  rows={4}
                  style={{ resize: 'vertical', fontSize: 12 }}
                  placeholder='{"v":1,"kind":"vtafarm.stack-connection", …}'
                  value={bundleText}
                  onChange={e => { setBundleText(e.target.value); setConfirmed(null); setBundleError('') }}
                  onBlur={e => checkBundle(e.target.value)}
                  onPaste={e => {
                    const text = e.clipboardData.getData('text')
                    if (text) setTimeout(() => checkBundle(text), 0)
                  }}
                />
                <div className="field-hint">Paste the whole bundle from the stack owner's Share panel.</div>

                {checking && <div className="field-hint" style={{ marginTop: 6 }}>Checking…</div>}

                {bundleError && (
                  <p className="text-sm" style={{ color: 'hsl(var(--destructive))', margin: '8px 0 0' }}>{bundleError}</p>
                )}

                {/* Rendered only from the server's answer. Building this from
                    the pasted JSON would show a confident tick for a bundle
                    whose code is garbage — see checkBundle. The share code is
                    never echoed here: it is a credential on a screen somebody
                    may be sharing. */}
                {confirmed && !checking && (
                  <div className="p-card" style={{ marginTop: 10, background: 'hsl(var(--muted)/.4)', border: 'none' }}>
                    <div className="card-content p-col gap-8" style={{ padding: '12px 16px' }}>
                      <span className="text-sm" style={{ fontWeight: 600 }}>
                        ✓ {confirmed.stack} · {confirmed.farm}
                      </span>
                      <div className="p-col gap-4">
                        <span className="p-mono text-xs p-muted" style={{ wordBreak: 'break-all' }}>
                          mediator&nbsp; {confirmed.mediator_did}
                        </span>
                        <span className="p-mono text-xs p-muted" style={{ wordBreak: 'break-all' }}>
                          DID host&nbsp; {confirmed.did_hosting_server_url}
                        </span>
                      </div>
                      {confirmed.connections_max != null && (
                        <span className="field-hint">
                          {confirmed.connections_used ?? 0} of {confirmed.connections_max} agents connected
                        </span>
                      )}
                      <span className="field-hint">
                        Your agent will depend on this stack. If its owner deletes it, your agent
                        stops working and can't be reconnected.
                      </span>
                    </div>
                  </div>
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
                      {' '}to run this agent under your own hostnames.
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

            <div className="p-section-title" style={{ marginTop: 4 }}>Personal setup</div>
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
                  <input className="p-input p-mono" id="cv-name" type="text" value={vtaName}
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
                      <input className="p-input p-mono" id="cv-vtc-name" type="text" value={vtcName}
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
          </div>
          <div className="card-footer between">
            <span className="field-hint" style={{ marginTop: 0 }}>
              {selectedDomain
                ? 'Your domain is already verified — provisioning starts right away.'
                : mode === 'full_stack'
                  ? '4 DNS records are created immediately after session creation.'
                  : 'A DNS record is created immediately after session creation.'}
            </span>
            <button className="btn btn-default" onClick={handleCreate} disabled={creating || modeUnavailable}>
              {creating ? 'Creating…' : modeUnavailable ? 'Unavailable' : <>Create session <span className="arrow">→</span></>}
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
                      onKeyDown={e => e.key === 'Enter' && handleProvision()}
                      disabled={provisioning} />
                  </div>
                  <div className="field-hint">Paste the <span className="p-mono">did:key:…</span> generated by your local identity tool.</div>
                </div>
                {provisionError && <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{provisionError}</p>}
              </div>
              <div className="card-footer between">
                <button className="btn btn-ghost" onClick={handleDone}>Cancel</button>
                <button className="btn btn-default" onClick={handleProvision} disabled={provisioning || !adminDid.trim() || !liveSession?.vta_did}>
                  {provisioning
                    ? <><svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width: 14, height: 14 }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Provisioning…</>
                    : <>Provision agent <span className="arrow">→</span></>}
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

      {/* Stage 2 (vta_only) */}
      {mode === 'vta_only' && !setupFailed && stage === 2 && (
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

      {/* Stage 3 (vta_only) */}
      {mode === 'vta_only' && !setupFailed && stage === 3 && (
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
