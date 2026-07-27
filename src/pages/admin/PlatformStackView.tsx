import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, API_BASE, ALL_COMPONENTS, type PlatformStack, type UpgradeComponent } from '@/lib/api'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PhaseStepper } from '../portal/PhaseStepper'
import { FULL_STACK_PHASES, phaseIndex, statusBadge, useCopyState, isValidAdminDid, componentHost, useDomainInfo } from '../portal/portalUtils'

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

export function PlatformStackView() {
  const navigate = useNavigate()
  const { copiedKey, copy } = useCopyState()
  // The admin-cookie twin of the portal's route: this panel authenticates
  // differently, and the hostnames have to be nameable before they exist.
  const domainInfo = useDomainInfo('admin')

  const [stack, setStack] = useState<PlatformStack | null>(null)
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<string[]>([])
  const consoleBodyRef = useRef<HTMLDivElement>(null)

  const [label, setLabel] = useState('firstperson')
  const [adminDid, setAdminDid] = useState('')
  const [images, setImages] = useState<Record<UpgradeComponent, ImageOption[]>>({ vta: [], mediator: [], dids: [], vtc: [] })
  const [selected, setSelected] = useState<Record<UpgradeComponent, string>>({ vta: '', mediator: '', dids: '', vtc: '' })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Remaining full_stack capacity. beta_access doesn't apply here (the caller
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
    if (!sessionId || settled || status === 'awaiting_admin_did') return
    const es = new EventSource(`${API_BASE}/api/v1/admin/setup-sessions/${sessionId}/logs`, { withCredentials: true })
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
  }, [sessionId, status, settled])

  // Scroll the console body, not the page.
  useEffect(() => {
    const el = consoleBodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs])

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
    const trimmedDid = adminDid.trim()
    if (!trimmedLabel) { setCreateError('Enter a label'); return }
    if (!isValidAdminDid(trimmedDid)) {
      setCreateError('Invalid did:key — paste only the did:key value (e.g. did:key:z6Mk…) with no surrounding text, labels, quotes, or whitespace.')
      return
    }
    if (ALL_COMPONENTS.some(c => !selected[c])) { setCreateError('Select an image for every component'); return }

    setCreateError(''); setCreating(true)
    try {
      await api.createPlatformStack({
        label: trimmedLabel,
        admin_did: trimmedDid,
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

  const head = (
    <div className="page-head">
      <div>
        <h1>Platform stack</h1>
        <p className="sub">
          The farm's own full stack, on our zone's fixed hostnames — and the mediator and
          DID host every VTA-only session points at.
        </p>
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
                  <p style={{ margin: '6px 0 0' }}>The label below reaches none of them.</p>
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

            <div>
              <label className="p-label" htmlFor="ps-admin-did">Admin DID <span className="req">*</span></label>
              <input className="p-input p-mono" id="ps-admin-did" type="text" placeholder="did:key:z6Mk…"
                value={adminDid} onChange={e => setAdminDid(e.target.value)} />
              <div className="field-hint">
                Required up front, unlike a user's session. The stack is owned by a
                passkey-less system account, so nothing could resume it later if the
                pipeline parked waiting for this.
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
  const running = status === 'running'
  const currentIndex = Math.max(0, phaseIndex(FULL_STACK_PHASES, status))
  const cfg = stack.config_values

  return (
    <section className="p-content">
      {head}

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

      <PhaseStepper phases={FULL_STACK_PHASES} currentIndex={currentIndex} failed={failed} spinning={!failed && !running} />

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

      {running && (
        <div className="p-alert alert-success" style={{ marginBottom: 16 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z"/><path d="m9 12 2 2 4-4"/></svg>
          <div className="grow">
            <p className="alert-title">Platform stack is online</p>
            <p className="alert-desc">
              Copy the values below into the environment so VTA-only sessions point at
              these hostnames instead of a disposable dev session.
            </p>
          </div>
        </div>
      )}

      {!running && !failed && (
        <div className="p-card" style={{ marginBottom: 16 }}>
          <div className="card-header with-action">
            <div>
              <h3 className="card-title">{FULL_STACK_PHASES[currentIndex]?.label ?? 'Setup'}</h3>
              <p className="card-desc">
                Provisioning <span className="p-mono">{stack.label}</span>. This takes several
                minutes — the page refreshes itself.
              </p>
            </div>
            <span className="p-badge badge-warning"><span className="dot pulse-dot"/>streaming</span>
          </div>
          <div className="card-content">
            <div className="p-console">
              <div className="console-head">
                <div className="dots"><span/><span/><span/></div>
                <span className="p-mono">vtafarm · platform-stack {stack.label}</span>
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
      )}

      {stack.urls && (
        <div className="p-card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h3 className="card-title">Endpoints</h3></div>
          <div className="card-content p-col gap-12" style={{ paddingTop: 14 }}>
            {(['vta', 'mediator', 'dids', 'vtc'] as const).map(component => (
              <div key={component} className="p-row between" style={{ gap: 16, alignItems: 'flex-start' }}>
                <span className="p-muted text-sm" style={{ flexShrink: 0 }}>{COMPONENT_LABELS[component]}</span>
                <a href={stack.urls![component]} target="_blank" rel="noopener" className="p-mono text-xs"
                  style={{ color: 'hsl(var(--primary))', textAlign: 'right', overflowWrap: 'anywhere', minWidth: 0 }}>
                  {stack.urls![component]}
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {cfg && (
        <div className="p-card">
          <div className="card-header">
            <h3 className="card-title">Configuration values</h3>
            <p className="card-desc">
              Paste these into the environment. <span className="p-mono">MEDIATOR_DID</span> and{' '}
              <span className="p-mono">DID_HOSTING_DID</span> are minted by the pipeline, so
              they stay empty until it reaches that step.
            </p>
          </div>
          <div className="card-content p-col gap-12" style={{ paddingTop: 14 }}>
            <CopyRow label="MEDIATOR_DID" value={cfg.MEDIATOR_DID}
              copyKey="cfg-mediator-did" copiedKey={copiedKey} onCopy={copy} />
            <CopyRow label="DID_HOSTING_SERVER_URL" value={cfg.DID_HOSTING_SERVER_URL}
              copyKey="cfg-dids-server" copiedKey={copiedKey} onCopy={copy} />
            <CopyRow label="DID_HOSTING_CONTROL_URL" value={cfg.DID_HOSTING_CONTROL_URL}
              copyKey="cfg-dids-control" copiedKey={copiedKey} onCopy={copy} />
            <CopyRow label="DID_HOSTING_DID" value={cfg.DID_HOSTING_DID}
              copyKey="cfg-dids-did" copiedKey={copiedKey} onCopy={copy} />
          </div>
        </div>
      )}
    </section>
  )
}
