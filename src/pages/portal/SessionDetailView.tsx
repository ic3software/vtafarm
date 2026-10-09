import { useState, useEffect, useRef, type KeyboardEvent } from 'react'
import { useParams, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { api, type SetupSession, API_BASE } from '@/lib/api'
import { statusBadge, FULL_STACK_PHASES, phaseIndex, domainTypeBadge, vtaOnlyPhases, modeLabel } from './portalUtils'
import { PhaseStepper } from './PhaseStepper'
import { DidsEnrollAlert, DidsEnrollConfigRow, VtcInstallAlert, VtcInstallConfigRow, CollectedDidsCard, EndpointConfigRows, AdminKeysCard, ConfigLinkRow, ConnectedToCard } from './FullStackOutputs'
import { useDidsEnroll, useVtcInstall } from './fullStackHooks'
import { SessionVersionsCard } from './SessionVersionsCard'
import { SessionExportCard } from './SessionExportCard'
import { SessionPnmCard } from './SessionPnmCard'
import { VtaConnectionCard } from './VtaConnectionCard'
import { StackConfigEditor } from '../StackConfigEditor'
import { ExternalDIDPublicationCard } from './ExternalDIDPublicationCard'
import type { PortalContext } from './Portal'

type SessionTab = 'overview' | 'connections' | 'settings' | 'credentials'

const SESSION_TABS: Array<{ value: SessionTab; label: string }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'connections', label: 'Connections' },
  { value: 'settings', label: 'Settings' },
]

const CREDENTIALS_TAB: { value: SessionTab; label: string } = {
  value: 'credentials',
  label: 'Credentials',
}

export function SessionDetailView() {
  const { id } = useParams<{ id: string }>()
  return <SessionDetailContent key={id} />
}

function SessionDetailContent() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { loadSessions } = useOutletContext<PortalContext>()
  const sessionId = id!

  const [session, setSession] = useState<SetupSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<string[]>([])
  // ACL maintenance replaces the VTA pod without changing session.status, so
  // its completion must explicitly invalidate the otherwise stable stream.
  const [logStreamGeneration, setLogStreamGeneration] = useState(0)
  const consoleBodyRef = useRef<HTMLDivElement>(null)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const didsEnroll = useDidsEnroll(session)
  const vtcInstall = useVtcInstall(session?.mode === 'full_stack' ? session : null)

  useEffect(() => {
    let active = true
    api.getSession(sessionId).then(s => { if (active) setSession(s) }).catch(() => {}).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [sessionId])

  // Poll every 3 s only while setup can still change without user input.
  useEffect(() => {
    if (!session || ['running', 'complete', 'failed'].includes(session.status)) return
    const iv = setInterval(() => {
      api.getSession(sessionId).then(s => {
        setSession(s)
        if (['running', 'complete', 'failed'].includes(s.status)) clearInterval(iv)
      }).catch(() => {})
    }, 3000)
    return () => clearInterval(iv)
    // Keyed on the status, not the object: this effect's own poll replaces
    // `session` every tick, so depending on it would rebuild the interval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, session?.status])

  useEffect(() => {
    if (!session) return
    const skip = ['dns_provisioned', 'awaiting_did_publication', 'vta_setup_complete', 'dns_provision', 'awaiting_admin_did']
    if (skip.includes(session.status)) return
    const source = logStreamGeneration > 0 ? '?source=vta' : ''
    const es = new EventSource(`${API_BASE}/api/v1/setup/${sessionId}/logs${source}`, { withCredentials: true })
    es.onmessage = e => setLogs(prev => [...prev, e.data])
    es.addEventListener('done', () => es.close())
    es.onerror = () => es.close()
    return () => es.close()
    // Keyed on the status, not the object: the 3s poll replaces `session` every
    // tick, so depending on it would reconnect this stream continuously.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, session?.status, logStreamGeneration])

  function reconnectVtaLogs() {
    setLogs([])
    setLogStreamGeneration(generation => generation + 1)
  }

  // Scroll only within the console body — not the whole page — as new lines arrive.
  useEffect(() => {
    const el = consoleBodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs])

  async function handleDelete() {
    if (deleteInput !== name) return
    setDeleteError('')
    setDeleting(true)
    try {
      await api.deleteSession(sessionId)
      loadSessions()
      navigate('/portal', { replace: true })
    } catch (err) {
      // Was silently swallowed: the spinner stopped, the agent was still there,
      // and nothing said why. On a confirmed destructive action that reads as
      // "it worked" until the list is refreshed.
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete the agent')
    }
    setDeleting(false)
  }

  // The route param is the agent's name — there is no opaque id any more — so
  // this stays right even before the session has loaded.
  const name = session?.vta_name ?? sessionId

  if (loading || (session && session.id !== sessionId)) return <section className="p-content"><p className="p-muted">Loading…</p></section>
  if (!session) return <section className="p-content"><p className="p-muted">Session not found.</p></section>

  const isFullStack = session.mode !== 'vta_only'
  const vtaDid = isFullStack ? session.collected?.vta_did : session.vta_did
  const isAwaitingAdmin = isFullStack ? session.status === 'awaiting_admin_did' : session.status === 'vta_setup_complete'
  const setupPhases = isFullStack
    ? FULL_STACK_PHASES
    : vtaOnlyPhases(session.connection_source === 'external')
  const setupFailed = session.status === 'failed'
  const setupProgressStatus = setupFailed ? session.failed_stage ?? 'running' : session.status
  const setupPhaseIndex = Math.max(0, phaseIndex(setupPhases, setupProgressStatus))
  const isFullStackCompleted = isFullStack && session.status === 'running'
  const sessionTabs = isFullStackCompleted
    ? [...SESSION_TABS.slice(0, 2), CREDENTIALS_TAB, SESSION_TABS[2]]
    : SESSION_TABS
  const requestedTab = searchParams.get('tab')
  const defaultTab: SessionTab = isAwaitingAdmin || session.status === 'awaiting_did_publication'
    ? 'connections'
    : 'overview'
  const activeTab = sessionTabs.some(tab => tab.value === requestedTab)
    ? requestedTab as SessionTab
    : defaultTab

  function selectTab(tab: SessionTab) {
    const next = new URLSearchParams(searchParams)
    if (tab === defaultTab) next.delete('tab')
    else next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % sessionTabs.length
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + sessionTabs.length) % sessionTabs.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = sessionTabs.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    selectTab(sessionTabs[nextIndex].value)
    tabRefs.current[nextIndex]?.focus()
  }

  const logConsole = (
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
      <div className="console-body" style={{ minHeight: 120 }} ref={consoleBodyRef}>
        {logs.length === 0 ? (
          <div className="ln"><span className="p-muted text-xs">
            {isAwaitingAdmin ? 'Waiting for admin DID provisioning…' : 'No logs yet.'}
          </span></div>
        ) : logs.map((line, i) => (
          <div key={i} className="ln"><span className="msg">{line}</span></div>
        ))}
      </div>
    </div>
  )

  const configurationCard = (
    <div className="p-card">
      <div className="card-header"><h3 className="card-title">Configuration</h3></div>
      <div className="card-content p-col gap-12" style={{ paddingTop: 14 }}>
        <div className="p-row between"><span className="p-muted text-sm">Mode</span><span className="p-badge badge-secondary">{modeLabel(session.mode)}</span></div>
        <hr className="p-sep"/>
        <div className="p-row between center">
          <span className="p-muted text-sm">Domain</span>
          <div className="p-row gap-8 center">
            {session.domain && <span className="p-mono text-xs">{session.domain}</span>}
            {domainTypeBadge(session.domain_type)}
          </div>
        </div>
        {session.domain_type === 'custom' && (
          <div className="field-hint" style={{ marginTop: -4 }}>
            Your own domain —{' '}
            <button type="button" className="btn btn-ghost btn-sm" style={{ padding: 0, height: 'auto' }}
              onClick={() => navigate('/portal/domains')}>
              manage it under Domains
            </button>
            . Its hostnames can't be changed: this agent's DIDs embed them permanently.
          </div>
        )}
        <hr className="p-sep"/>
        <div className="p-row between"><span className="p-muted text-sm">Created</span><span className="text-sm">{new Date(session.created_at).toLocaleString()}</span></div>
        {!isFullStack && session.url && (
          <><hr className="p-sep"/><ConfigLinkRow label="VTA" href={`${session.url}/health`} value={`${session.url}/health`} /></>
        )}
        {isFullStackCompleted && <EndpointConfigRows urls={session.urls} />}
        {isFullStackCompleted && <DidsEnrollConfigRow {...didsEnroll} />}
        {isFullStackCompleted && <VtcInstallConfigRow {...vtcInstall} />}
      </div>
    </div>
  )

  const dangerZone = (
    <div className="p-card" style={{ borderColor: 'hsl(var(--destructive)/.3)' }}>
      <div className="card-header">
        <h3 className="card-title" style={{ color: 'hsl(var(--destructive))' }}>Danger Zone</h3>
      </div>
      <div className="card-content">
        <hr className="p-sep" style={{ marginBottom: 14 }} />
        <div className="p-col" style={{ gap: 0 }}>
          <span className="text-sm fw-600">Delete Agent</span>
          <span className="p-muted text-xs" style={{ margin: '4px 0 14px' }}>
            <strong>Permanently</strong>
            {session.domain_type === 'custom'
              ? ' removes the agent and all session data. Your own DNS records are left untouched.'
              : ' removes the agent, DNS record, and all session data.'}
          </span>
          <div>
            <button className="btn btn-destructive btn-sm" onClick={() => setShowDeleteConfirm(true)}>
              Delete Agent
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <section className="p-content">
      <div className="page-head">
        <div>
          <div className="p-row gap-12" style={{ marginBottom: 6 }}>
            <button className="btn btn-ghost btn-sm session-back-button" onClick={() => { loadSessions(); navigate('/portal') }} style={{ padding: '0 8px 0 6px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="m15 18-6-6 6-6"/></svg>
              Agents
            </button>
          </div>
          <div className="p-row gap-12 center wrap-flex">
            <h1 className="p-mono" style={{ fontFamily: 'var(--mono)', fontSize: 22, whiteSpace: 'nowrap', marginBottom: 0 }}>{name}</h1>
            {statusBadge(session.status)}
          </div>
        </div>
      </div>

      {/* Failure banner */}
      {session.status === 'failed' && (
        <div className="p-alert alert-destructive" style={{ marginBottom: 20 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12"/></svg>
          <div className="grow">
            <p className="alert-title">Setup failed</p>
            <p className="alert-desc">{session.error_msg ?? 'An error occurred during setup.'} Delete this agent and create a new one to try again.</p>
          </div>
          <button className="btn btn-destructive btn-sm" style={{ flexShrink: 0 }} onClick={() => setShowDeleteConfirm(true)}>
            Delete agent
          </button>
        </div>
      )}

      {session.status !== 'running' && (
        <PhaseStepper phases={setupPhases} currentIndex={setupPhaseIndex} failed={setupFailed} />
      )}

      <div className="session-tabs" role="tablist" aria-label="Agent details">
        {sessionTabs.map((tab, index) => (
          <button
            key={tab.value}
            ref={element => { tabRefs.current[index] = element }}
            id={`session-tab-${tab.value}`}
            className="session-tab"
            type="button"
            role="tab"
            aria-controls={`session-panel-${tab.value}`}
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
        id="session-panel-overview"
        role="tabpanel"
        aria-labelledby="session-tab-overview"
        hidden={activeTab !== 'overview'}
      >
        {isFullStackCompleted && (
          <>
            <DidsEnrollAlert {...didsEnroll} />
            <VtcInstallAlert {...vtcInstall} />
          </>
        )}
        <div className="p-grid-2 session-overview-grid" style={{ alignItems: 'start' }}>
          {logConsole}
          <div>
            {isFullStackCompleted && <CollectedDidsCard collected={session.collected} />}
            {!isFullStack && session.vta_did && <CollectedDidsCard collected={{ vta_did: session.vta_did }} />}
            {!isFullStack && <ConnectedToCard session={session} />}
            {configurationCard}
          </div>
        </div>
      </section>

      <section
        id="session-panel-connections"
        role="tabpanel"
        aria-labelledby="session-tab-connections"
        hidden={activeTab !== 'connections'}
      >
        {!isFullStack && <ExternalDIDPublicationCard session={session} onValidated={() => {
          api.getSession(sessionId).then(setSession).catch(() => {})
        }} />}
        {vtaDid && !['provisioning', 'running', 'complete', 'failed'].includes(session.status) && (
          <VtaConnectionCard key={sessionId} session={session} sessionId={sessionId} vtaDid={vtaDid} ready={isAwaitingAdmin} onSessionChange={setSession} />
        )}
        {session.status === 'running' && (vtaDid ? (
          <SessionPnmCard sessionId={sessionId} vtaDid={vtaDid} onVtaRestarted={reconnectVtaLogs} />
        ) : (
          <div className="p-alert alert-warning" role="alert">
            <div className="grow">
              <p className="alert-title">Connection controls unavailable</p>
              <p className="alert-desc">This agent does not have a VTA DID yet.</p>
            </div>
          </div>
        ))}
        {isFullStack && session.status !== 'running' && !isAwaitingAdmin && (
          <div className="p-card">
            <div className="card-content session-acl-empty">
              <p className="p-muted text-sm">Administrator connection controls will appear here when setup reaches the Admin DID step.</p>
            </div>
          </div>
        )}
      </section>

      <section
        id="session-panel-settings"
        role="tabpanel"
        aria-labelledby="session-tab-settings"
        hidden={activeTab !== 'settings'}
      >
        <div className="session-settings-column">
          {session.status === 'running' && (
            <>
              <SessionVersionsCard
                session={session}
                onUpgraded={() => api.getSession(sessionId).then(setSession).catch(() => {})}
              />
              <StackConfigEditor sessionId={sessionId} vtaOnly={!isFullStack} />
            </>
          )}
          <SessionExportCard session={session} sessionId={sessionId} />
        </div>
        <div className="session-danger-zone">
          <hr className="p-sep" />
          {dangerZone}
        </div>
      </section>

      {isFullStackCompleted && (
        <section
          id="session-panel-credentials"
          role="tabpanel"
          aria-labelledby="session-tab-credentials"
          hidden={activeTab !== 'credentials'}
        >
          <AdminKeysCard session={session} />
        </section>
      )}

      {/* Delete confirm overlay */}
      {showDeleteConfirm && (
        <div className="p-overlay">
          <div className="p-dialog">
            <div className="dialog-header">
              <h3 className="dialog-title">Delete this agent?</h3>
              <p className="dialog-desc">
                {session.domain_type === 'custom'
                  ? <>This permanently destroys <span className="p-mono">{name}</span> and its session data. This cannot be undone.</>
                  : <>This permanently destroys <span className="p-mono">{name}</span>, its DNS record, and its session data. This cannot be undone.</>}
                {isFullStack && <> Agents using this stack's mediator or DID hosting will stop working.</>}
                {session.connection_source === 'external' && <> Remove its DID log and any ACL entry from your external hosting service yourself.</>}
              </p>
            </div>
            <div className="dialog-body">
              {session.domain_type === 'custom' && (
                <div className="p-alert alert-warning">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
                  <div className="grow">
                    <p className="alert-title">Your DNS records stay as they are</p>
                    <p className="alert-desc">
                      Delete the four CNAMEs at your provider afterwards — a record left
                      pointing at a service you no longer run is a security risk. Your domain
                      stays attached and can back a new agent.
                    </p>
                  </div>
                </div>
              )}
              <div>
                <label className="p-label">Type the agent's name <span className="p-mono">{name}</span> to confirm</label>
                <input className="p-input p-mono" placeholder={name} value={deleteInput} onChange={e => setDeleteInput(e.target.value)} />
              </div>
              {deleteError && (
                <p style={{ margin: '12px 0 0', fontSize: 13, color: 'hsl(var(--destructive))' }}>{deleteError}</p>
              )}
            </div>
            <div className="dialog-footer">
              <button className="btn btn-ghost" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button className="btn btn-destructive" onClick={handleDelete} disabled={deleting || deleteInput !== name}>
                {deleting ? 'Deleting…' : 'Delete Agent'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
