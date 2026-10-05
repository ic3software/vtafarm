import { useState, useEffect, useCallback, useRef, type KeyboardEvent, type RefObject } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, API_BASE, ALL_COMPONENTS, type PlatformStack, type SetupSession, type UpgradeComponent } from '@/lib/api'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PhaseStepper } from '../portal/PhaseStepper'
import { FULL_STACK_PHASES, phaseIndex, statusBadge, useCopyState, isValidAdminDid, componentHost, useDomainInfo } from '../portal/portalUtils'
import {
  DidsEnrollAlert, DidsEnrollConfigRow, VtcInstallAlert, VtcInstallConfigRow, CollectedDidsCard, EndpointConfigRows, AdminKeysCard,
} from '../portal/FullStackOutputs'
import { useDidsEnroll, useVtcInstall, type DidsEnrollState, type VtcInstallState } from '../portal/fullStackHooks'
import { adminSessionActions } from '../portal/sessionActions'
import { PlatformStackAdmins } from './PlatformStackAdmins'
import { StackConfigEditor } from '../StackConfigEditor'
import { SessionExportCard } from '../portal/SessionExportCard'
import { SessionVersionsCard } from '../portal/SessionVersionsCard'

// The farm's own full_stack, running under our zone's fixed labels —
// vta.{CLUSTER_DOMAIN}, vtc., mediator., dids. This is the only place it can be
// created: no user-facing surface can ever attach our own zone (the route
// rejects CLUSTER_DOMAIN and every subdomain of it for every caller, admins
// included), and this route always writes kind=platform.
//
// It needs neither domain verification nor certificates — the zone is ours and
// the wildcard already covers the names — which is why it ships well before the
// custom-domain UI exists.

type ImageOption = { tag: string; image: string; latest?: boolean }

type PlatformStackTab = 'overview' | 'administrators' | 'credentials' | 'settings'

const PLATFORM_STACK_TABS: Array<{ value: PlatformStackTab; label: string }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'administrators', label: 'Administrators' },
  { value: 'credentials', label: 'Credentials' },
  { value: 'settings', label: 'Settings' },
]

const COMPONENT_LABELS: Record<UpgradeComponent, string> = {
  vta: 'VTA',
  mediator: 'Mediator',
  dids: 'DID Hosting',
  vtc: 'VTC',
}

function CopyIcon({ copied }: { copied: boolean }) {
  return copied
    ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width: 14, height: 14 }}><path d="M20 6 9 17l-5-5"/></svg>
    : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 14, height: 14 }}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
}

// Same treatment as the portal's endpoint/DID rows — an operator is pasting
// these into environment config, so copy is the only realistic path.
function CopyRow({
  label, value, hint, copyKey, copiedKey, onCopy,
}: {
  label: string
  value: string
  hint?: string
  copyKey: string
  copiedKey: string | null
  onCopy: (key: string, value: string) => void
}) {
  const copied = copiedKey === copyKey
  const empty = !value
  return (
    <div className="p-card" style={{ background: 'hsl(var(--muted)/.4)', border: 'none' }}>
      <div className="card-content" style={{ padding: '12px 16px' }}>
        <div className="p-row between center" style={{ gap: 12 }}>
          <div className="p-col" style={{ minWidth: 0 }}>
            <span className="p-muted text-xs" style={{ letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
              {label}
            </span>
            <p className="p-mono" style={{ margin: '4px 0 0', fontSize: 12, wordBreak: 'break-all', color: empty ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))' }}>
              {empty ? 'not minted yet' : value}
            </p>
            {hint && <span className="field-hint" style={{ marginTop: 4 }}>{hint}</span>}
          </div>
          <button className="btn btn-outline btn-sm" style={{ flexShrink: 0, gap: 6 }}
            disabled={empty} onClick={() => onCopy(copyKey, value)}>
            <CopyIcon copied={copied} />
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  )
}

function LogConsole({
  label, logs, bodyRef, streaming = false,
}: {
  label: string
  logs: string[]
  bodyRef: RefObject<HTMLDivElement | null>
  streaming?: boolean
}) {
  return (
    <div className="p-console">
      <div className="console-head">
        <div className="dots"><span/><span/><span/></div>
        <span className="p-mono">vtafarm · logs --follow {label}</span>
        <span className="grow"/>
        {streaming && (
          <span className="p-badge badge-warning" style={{ height: 18, fontSize: 10, background: 'hsl(35 92% 50% /.16)' }}>
            <span className="dot pulse-dot"/>streaming
          </span>
        )}
      </div>
      <div className="console-body" ref={bodyRef}>
        {logs.length === 0 ? (
          <div className="ln"><span className="p-muted text-xs">{streaming ? 'Waiting for output…' : 'No logs yet.'}</span></div>
        ) : logs.map((line, index) => (
          <div key={index} className="ln"><span className="msg">{line}</span></div>
        ))}
      </div>
    </div>
  )
}

function PlatformStackTabs({
  stack,
  session,
  logs,
  consoleBodyRef,
  searchParams,
  setSearchParams,
  tabRefs,
  didsEnroll,
  vtcInstall,
  onVtaRestarted,
  onStackUpdated,
  onDeleted,
}: {
  stack: PlatformStack
  session: SetupSession
  logs: string[]
  consoleBodyRef: RefObject<HTMLDivElement | null>
  searchParams: URLSearchParams
  setSearchParams: ReturnType<typeof useSearchParams>[1]
  tabRefs: RefObject<Array<HTMLButtonElement | null>>
  didsEnroll: DidsEnrollState
  vtcInstall: VtcInstallState
  onVtaRestarted: () => void
  onStackUpdated: () => Promise<void>
  onDeleted: () => Promise<void>
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const requestedTab = searchParams.get('tab')
  const activeTab = PLATFORM_STACK_TABS.some(tab => tab.value === requestedTab)
    ? requestedTab as PlatformStackTab
    : 'overview'

  function selectTab(tab: PlatformStackTab) {
    const next = new URLSearchParams(searchParams)
    if (tab === 'overview') next.delete('tab')
    else next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % PLATFORM_STACK_TABS.length
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + PLATFORM_STACK_TABS.length) % PLATFORM_STACK_TABS.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = PLATFORM_STACK_TABS.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    selectTab(PLATFORM_STACK_TABS[nextIndex].value)
    tabRefs.current[nextIndex]?.focus()
  }

  async function handleDelete() {
    if (deleteInput !== session.id) return
    setDeleting(true)
    setDeleteError('')
    try {
      await api.adminDeleteSession(session.id, session.id)
      await onDeleted()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete the platform stack')
      setDeleting(false)
    }
  }

  const configurationCard = (
    <div className="p-card">
      <div className="card-header"><h3 className="card-title">Configuration</h3></div>
      <div className="card-content p-col gap-12" style={{ paddingTop: 14 }}>
        <div className="p-row between">
          <span className="p-muted text-sm">Mode</span>
          <span className="p-badge badge-secondary">full_stack</span>
        </div>
        <hr className="p-sep"/>
        <div className="p-row between center" style={{ gap: 16 }}>
          <span className="p-muted text-sm">Domain</span>
          <span className="p-mono text-xs" style={{ textAlign: 'right', overflowWrap: 'anywhere' }}>{stack.domain}</span>
        </div>
        {stack.created_at && (
          <>
            <hr className="p-sep"/>
            <div className="p-row between" style={{ gap: 16 }}>
              <span className="p-muted text-sm">Created</span>
              <span className="text-sm" style={{ textAlign: 'right' }}>{new Date(stack.created_at).toLocaleString()}</span>
            </div>
          </>
        )}
        <EndpointConfigRows urls={stack.urls} />
        <DidsEnrollConfigRow {...didsEnroll} />
        <VtcInstallConfigRow {...vtcInstall} />
      </div>
    </div>
  )

  return (
    <>
      <div className="session-tabs" role="tablist" aria-label="Platform stack details">
        {PLATFORM_STACK_TABS.map((tab, index) => (
          <button
            key={tab.value}
            ref={element => { tabRefs.current[index] = element }}
            id={`platform-stack-tab-${tab.value}`}
            className="session-tab"
            type="button"
            role="tab"
            aria-controls={`platform-stack-panel-${tab.value}`}
            aria-selected={activeTab === tab.value}
            tabIndex={activeTab === tab.value ? 0 : -1}
            onClick={() => selectTab(tab.value)}
            onKeyDown={event => handleTabKey(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section
        id="platform-stack-panel-overview"
        role="tabpanel"
        aria-labelledby="platform-stack-tab-overview"
        hidden={activeTab !== 'overview'}
      >
        <DidsEnrollAlert {...didsEnroll} />
        <VtcInstallAlert {...vtcInstall} />
        <div className="p-grid-2 session-overview-grid" style={{ alignItems: 'start' }}>
          <LogConsole label={stack.label ?? session.id} logs={logs} bodyRef={consoleBodyRef} />
          <div>
            <CollectedDidsCard collected={stack.collected} />
            {configurationCard}
          </div>
        </div>
      </section>

      <section
        id="platform-stack-panel-administrators"
        role="tabpanel"
        aria-labelledby="platform-stack-tab-administrators"
        hidden={activeTab !== 'administrators'}
      >
        <PlatformStackAdmins onVtaRestarted={onVtaRestarted} />
      </section>

      <section
        id="platform-stack-panel-credentials"
        role="tabpanel"
        aria-labelledby="platform-stack-tab-credentials"
        hidden={activeTab !== 'credentials'}
      >
        <AdminKeysCard session={session} />
      </section>

      <section
        id="platform-stack-panel-settings"
        role="tabpanel"
        aria-labelledby="platform-stack-tab-settings"
        hidden={activeTab !== 'settings'}
      >
        <div className="session-settings-column">
          <SessionVersionsCard admin session={session} onUpgraded={() => { void onStackUpdated() }} />
          <StackConfigEditor admin />
          <SessionExportCard admin session={session} sessionId={session.id} />
        </div>
        <div className="session-danger-zone">
          <hr className="p-sep" />
          <div className="p-card" style={{ borderColor: 'hsl(var(--destructive)/.3)' }}>
            <div className="card-header">
              <h3 className="card-title" style={{ color: 'hsl(var(--destructive))' }}>Danger Zone</h3>
            </div>
            <div className="card-content">
              <hr className="p-sep" style={{ marginBottom: 14 }} />
              <div className="p-col" style={{ gap: 0 }}>
                <span className="text-sm fw-600">Delete platform stack</span>
                <span className="p-muted text-xs" style={{ margin: '4px 0 14px' }}>
                  Permanently removes the platform stack, its DNS records, and all session data. VTA-only agents that use its mediator or DID hosting will stop working.
                </span>
                <div>
                  <button className="btn btn-destructive btn-sm" onClick={() => setShowDeleteConfirm(true)}>
                    Delete platform stack
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {showDeleteConfirm && (
        <div className="p-overlay">
          <div className="p-dialog">
            <div className="dialog-header">
              <h3 className="dialog-title">Delete the platform stack?</h3>
              <p className="dialog-desc">
                This permanently destroys <span className="p-mono">{session.id}</span>, its DNS records, and all session data. VTA-only agents that depend on this stack will stop working. This cannot be undone.
              </p>
            </div>
            <div className="dialog-body">
              <div className="p-alert alert-destructive">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
                <div className="grow">
                  <p className="alert-title">This affects other agents</p>
                  <p className="alert-desc">Do not delete this stack while any VTA-only agent still depends on it.</p>
                </div>
              </div>
              <div>
                <label className="p-label">
                  Type the stack name <span className="p-mono">{session.id}</span> to confirm
                </label>
                <input
                  className="p-input p-mono"
                  placeholder={session.id}
                  value={deleteInput}
                  onChange={event => setDeleteInput(event.target.value)}
                  disabled={deleting}
                />
              </div>
              {deleteError && (
                <p role="alert" style={{ margin: '12px 0 0', fontSize: 13, color: 'hsl(var(--destructive))' }}>{deleteError}</p>
              )}
            </div>
            <div className="dialog-footer">
              <button className="btn btn-ghost" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>Cancel</button>
              <button className="btn btn-destructive" onClick={handleDelete} disabled={deleting || deleteInput !== session.id}>
                {deleting ? 'Deleting…' : 'Delete platform stack'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function PlatformStackView() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { copiedKey, copy } = useCopyState()
  // The admin-cookie twin of the portal's route: this panel authenticates
  // differently, and the hostnames have to be nameable before they exist.
  const domainInfo = useDomainInfo('admin')

  const [stack, setStack] = useState<PlatformStack | null>(null)
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<string[]>([])
  const [logStreamGeneration, setLogStreamGeneration] = useState(0)
  const consoleBodyRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const [label, setLabel] = useState('firstperson')
  // Submitted at awaiting_admin_did, not at create: `pnm setup` mints it
  // locally from the VTA DID, which the pipeline only produces once it runs.
  const [adminDid, setAdminDid] = useState('')
  const [provisioning, setProvisioning] = useState(false)
  const [provisionError, setProvisionError] = useState('')
  const [images, setImages] = useState<Record<UpgradeComponent, ImageOption[]>>({ vta: [], mediator: [], dids: [], vtc: [] })
  const [selected, setSelected] = useState<Record<UpgradeComponent, string>>({ vta: '', mediator: '', dids: '', vtc: '' })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Remaining full_stack capacity. fullstack_access doesn't apply here (the caller
  // is an admin) but capacity does — the platform stack costs the same as any
  // other full stack, and an admin needs to know before it fails to schedule.
  const [fullStackFits, setFullStackFits] = useState<boolean | null>(null)

  const load = useCallback(() => (
    api.getPlatformStack()
      .then(setStack)
      .catch(() => {})
      .finally(() => setLoading(false))
  ), [])

  useEffect(() => { void load() }, [load])

  // Poll while the pipeline is in flight; stop once it settles.
  const status = stack?.status
  const settled = !stack?.exists || status === 'running' || status === 'failed'
  useEffect(() => {
    if (settled) return
    const iv = setInterval(() => { void load() }, 3000)
    return () => clearInterval(iv)
  }, [settled, load])

  // Reconnect the log stream on every status change — each pipeline step is
  // its own Job and its own pod, so the previous stream has already ended.
  const sessionId = stack?.id
  useEffect(() => {
    if (!sessionId || status === 'failed' || status === 'awaiting_admin_did') return
    const source = status === 'running' ? '?source=vta' : ''
    const es = new EventSource(`${API_BASE}/api/v1/admin/setup-sessions/${sessionId}/logs${source}`, { withCredentials: true })
    // Clear when the new stream actually opens rather than up front, so the
    // previous step's output stays on screen instead of blanking during the
    // reconnect between two Jobs.
    let cleared = false
    const clearOnce = () => { if (!cleared) { cleared = true; setLogs([]) } }
    es.onopen = clearOnce
    es.onmessage = e => { clearOnce(); setLogs(prev => [...prev, e.data]) }
    es.addEventListener('done', () => es.close())
    es.onerror = () => es.close()
    return () => es.close()
  }, [sessionId, status, logStreamGeneration])

  function reconnectVtaLogs() {
    setLogs([])
    setLogStreamGeneration(generation => generation + 1)
  }

  async function refreshAfterUpgrade() {
    await load()
    reconnectVtaLogs()
  }

  // Scroll the console body, not the page.
  useEffect(() => {
    const el = consoleBodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs])

  // The shared output components speak SetupSession — this endpoint returns the
  // same fields under a different envelope, so adapt rather than fork them.
  // Built before the early returns below because the two hooks must run on
  // every render.
  const sessionLike: SetupSession | null = stack?.exists && stack.id
    ? {
        id: stack.id,
        status: stack.status ?? 'running',
        mode: 'full_stack',
        urls: stack.urls,
        collected: stack.collected,
        action_required: stack.action_required,
        dids_enroll_used: stack.dids_enroll_used,
        vtc_install_used: stack.vtc_install_used,
        mediator_admin_key: stack.mediator_admin_key,
        webvh_admin_key: stack.webvh_admin_key,
        vta_image: stack.images?.vta,
        mediator_image: stack.images?.mediator,
        dids_image: stack.images?.dids,
        vtc_image: stack.images?.vtc,
        created_at: stack.created_at ?? '',
      }
    : null
  // Admin twins: this stack's owner is a passkey-less account, so the
  // user-facing ack/reissue routes can never be called for it.
  const didsEnroll = useDidsEnroll(sessionLike, adminSessionActions)
  const vtcInstall = useVtcInstall(sessionLike, adminSessionActions)

  // Only load the create form's inputs when there's a form to fill.
  const needsForm = !loading && !stack?.exists
  const imagesLoaded = useRef(false)
  useEffect(() => {
    if (!needsForm || imagesLoaded.current) return
    imagesLoaded.current = true
    for (const component of ALL_COMPONENTS) {
      api.adminListImages(component)
        .then(imgs => {
          setImages(prev => ({ ...prev, [component]: imgs }))
          const latest = imgs.find(i => i.latest) ?? imgs[0]
          setSelected(prev => ({ ...prev, [component]: prev[component] || (latest?.image ?? '') }))
        })
        .catch(() => {})
    }
    api.adminDashboard()
      .then(d => setFullStackFits(d.estimates.full_stack.count >= 1))
      .catch(() => setFullStackFits(null))
  }, [needsForm])

  async function handleCreate() {
    const trimmedLabel = label.trim()
    if (!trimmedLabel) { setCreateError('Enter a label'); return }
    if (ALL_COMPONENTS.some(c => !selected[c])) { setCreateError('Select an image for every component'); return }

    setCreateError(''); setCreating(true)
    try {
      await api.createPlatformStack({
        label: trimmedLabel,
        vta_image: selected.vta,
        mediator_image: selected.mediator,
        dids_image: selected.dids,
        vtc_image: selected.vtc,
      })
      await load()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create the platform stack')
    } finally {
      setCreating(false)
    }
  }

  async function handleProvision() {
    const trimmed = adminDid.trim()
    if (!isValidAdminDid(trimmed)) {
      setProvisionError('Invalid did:key — paste only the did:key value (e.g. did:key:z6Mk…) with no surrounding text, labels, quotes, or whitespace.')
      return
    }
    if (!stack?.id) return
    setProvisionError(''); setProvisioning(true)
    try {
      await api.adminProvisionAdmin(stack.id, trimmed)
      await load()
      // Leave `provisioning` set: the poll above picks the status change up and
      // moves past this screen, so there is no done state to reset to.
    } catch (err) {
      setProvisionError(err instanceof Error ? err.message : 'Provisioning failed')
      setProvisioning(false)
    }
  }

  const running = stack?.status === 'running'
  const head = (
    <div className="page-head">
      <div>
        {running ? (
          <div className="p-row gap-12 center wrap-flex">
            <h1 className="p-mono" style={{ fontFamily: 'var(--mono)', fontSize: 22, whiteSpace: 'nowrap', marginBottom: 0 }}>
              {stack?.label}
            </h1>
            {statusBadge('running')}
          </div>
        ) : (
          <>
            <h1>Platform stack</h1>
            <p className="sub">
              The farm's own full stack, on our zone's fixed hostnames — and the mediator and
              DID host every VTA-only session points at.
            </p>
          </>
        )}
      </div>
    </div>
  )

  if (loading) {
    return (
      <section className="p-content">
        {head}
        <div className="p-card"><div className="card-content"><p className="p-muted text-sm" style={{ margin: 0 }}>Loading…</p></div></div>
      </section>
    )
  }

  // ── Not created ────────────────────────────────────────────────────────────
  if (!stack?.exists) {
    return (
      <section className="p-content">
        {head}

        <div className="p-card">
          <div className="card-header">
            <h3 className="card-title">Create the platform stack</h3>
            <p className="card-desc">
              One action creates the whole thing: the domain row for our own zone, four
              proxied DNS records, and the <span className="p-mono">full_stack</span> session
              against them. There is no domain verification and no certificate to issue —
              the zone is ours and the wildcard already covers these names, so this consumes
              no Let's Encrypt quota.
            </p>
          </div>
          <div className="card-content p-col gap-16">
            {fullStackFits === false && (
              <div className="p-alert alert-warning">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
                <div className="grow">
                  <p className="alert-title">The cluster is at capacity</p>
                  <p className="alert-desc">
                    The platform stack consumes the same resources as any other full stack.
                    Creating it now will be refused until capacity frees up.
                  </p>
                </div>
              </div>
            )}

            <div className="p-alert alert-info">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
              <div className="grow">
                <p className="alert-title">Hostnames it will claim</p>
                <div className="alert-desc">
                  {domainInfo ? (
                    <div className="p-col" style={{ gap: 2, marginTop: 4 }}>
                      {ALL_COMPONENTS.map(component => (
                        <span key={component} className="p-mono" style={{ fontSize: 12 }}>
                          {componentHost(domainInfo, component, { fixedLabels: true })}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <>
                      <span className="p-mono">vta.</span>, <span className="p-mono">vtc.</span>,{' '}
                      <span className="p-mono">mediator.</span> and <span className="p-mono">dids.</span>{' '}
                      on the farm's own zone.
                    </>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="p-label" htmlFor="ps-label">Label <span className="req">*</span></label>
              <input className="p-input p-mono" id="ps-label" type="text" value={label}
                onChange={e => setLabel(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} />
              <div className="field-hint">
                Appears in no hostname. It survives only in the stack's DID paths —{' '}
                <span className="p-mono">did:webvh:&lt;scid&gt;:dids.…:{label || 'firstperson'}-vta</span> — and is
                what deleting the stack asks you to type.
              </div>
            </div>

            {ALL_COMPONENTS.map(component => (
              <div key={component}>
                <label className="p-label" htmlFor={`ps-image-${component}`}>
                  {COMPONENT_LABELS[component]} image <span className="req">*</span>
                </label>
                {images[component].length > 0 ? (
                  <Select value={selected[component]}
                    onValueChange={v => setSelected(prev => ({ ...prev, [component]: v }))}>
                    <SelectTrigger className="w-full" id={`ps-image-${component}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {images[component].map(img => (
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
            ))}

            {createError && <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{createError}</p>}
          </div>
          <div className="card-footer between">
            <span className="field-hint" style={{ marginTop: 0 }}>
              Exactly one per environment. Development and production each get their own.
            </span>
            <button className="btn btn-default" onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating…' : <>Create platform stack <span className="arrow">→</span></>}
            </button>
          </div>
        </div>
      </section>
    )
  }

  // ── Exists ─────────────────────────────────────────────────────────────────
  const failed = status === 'failed'
  const isRunning = status === 'running'
  const awaitingAdminDid = status === 'awaiting_admin_did'
  const progressStatus = failed ? stack.failed_stage ?? 'running' : status
  const currentIndex = Math.max(0, phaseIndex(FULL_STACK_PHASES, progressStatus))
  const vtaDid = stack.collected?.vta_did

  return (
    <section className="p-content">
      {head}

      {!isRunning && (
        <>
          <div className="p-card" style={{ marginBottom: 16 }}>
            <div className="card-content" style={{ padding: '14px 20px' }}>
              <div className="p-row between center">
                <div className="p-col" style={{ gap: 4 }}>
                  <span className="p-label" style={{ marginBottom: 0 }}>
                    Session #{stack.id} · <span className="p-mono">{stack.label}</span>
                  </span>
                  <span className="p-mono text-xs p-muted">{stack.urls?.vta ?? stack.domain}</span>
                </div>
                <div className="p-row gap-8 center">
                  {status && statusBadge(status)}
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/sessions')}>
                    Manage in Sessions
                  </button>
                </div>
              </div>
            </div>
          </div>

          <PhaseStepper phases={FULL_STACK_PHASES} currentIndex={currentIndex} failed={failed} spinning={!failed} />
        </>
      )}

      {failed && (
        <div className="p-alert alert-destructive" style={{ marginBottom: 16 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12"/></svg>
          <div className="grow">
            <p className="alert-title">Setup failed</p>
            <p className="alert-desc">
              {stack.error_msg || 'An error occurred.'} Delete the stack from the Sessions
              page — deleting it takes every VTA-only session's mediator and DID host with
              it — then create it again.
            </p>
          </div>
        </div>
      )}

      {/* Same step a user's session reaches, and for the same reason: the admin
          DID is minted locally by `pnm setup` from the VTA DID above, which
          only exists once the pipeline has produced it. The one difference is
          that any admin can complete it — this stack has no owning user. */}
      {awaitingAdminDid && (
        <div className="p-card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <h3 className="card-title">Provision admin DID</h3>
            <p className="card-desc">
              VTA, Mediator and DID Hosting are up. Run <span className="p-mono">pnm setup</span>{' '}
              locally against the VTA DID below, and paste the admin DID it outputs.
            </p>
          </div>
          <div className="card-content p-col gap-16">
            {vtaDid && (
              <CopyRow label="VTA DID" value={vtaDid}
                copyKey="vta-did" copiedKey={copiedKey} onCopy={copy} />
            )}
            <div>
              <label className="p-label" htmlFor="ps-admin-did">Admin DID</label>
              <input className="p-input p-mono" id="ps-admin-did" type="text" placeholder="did:key:z6Mk…"
                autoFocus value={adminDid} onChange={e => setAdminDid(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleProvision()}
                disabled={provisioning} />
              <div className="field-hint">
                Paste the <span className="p-mono">did:key:…</span> generated by your local
                identity tool.
              </div>
            </div>
            {provisionError && <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{provisionError}</p>}
          </div>
          <div className="card-footer" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-default" onClick={handleProvision}
              disabled={provisioning || !adminDid.trim() || !vtaDid}>
              {provisioning ? 'Provisioning…' : <>Provision stack <span className="arrow">→</span></>}
            </button>
          </div>
        </div>
      )}

      {!isRunning && !failed && !awaitingAdminDid && (
        <div className="p-card" style={{ marginBottom: 16 }}>
          <div className="card-header with-action">
            <div>
              <h3 className="card-title">{FULL_STACK_PHASES[currentIndex]?.label ?? 'Setup'}</h3>
              <p className="card-desc">
                Provisioning <span className="p-mono">{stack.label}</span>. This takes several
                minutes — the page refreshes itself.
              </p>
            </div>
          </div>
          <div className="card-content">
            <LogConsole
              label={stack.label ?? stack.id ?? 'platform-stack'}
              logs={logs}
              bodyRef={consoleBodyRef}
              streaming
            />
          </div>
        </div>
      )}

      {/* Outputs appear only once the stack is running — the same point a
          user's session surfaces its own. Before that they are either empty or
          half-minted, and a half-filled configuration block invites someone to
          paste it somewhere. */}
      {isRunning && sessionLike && (
        <PlatformStackTabs
          stack={stack}
          session={sessionLike}
          logs={logs}
          consoleBodyRef={consoleBodyRef}
          searchParams={searchParams}
          setSearchParams={setSearchParams}
          tabRefs={tabRefs}
          didsEnroll={didsEnroll}
          vtcInstall={vtcInstall}
          onVtaRestarted={reconnectVtaLogs}
          onStackUpdated={refreshAfterUpgrade}
          onDeleted={load}
        />
      )}
    </section>
  )
}
