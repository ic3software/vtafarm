import { useState, useEffect, useCallback, Fragment } from 'react'
import { Outlet, useNavigate, useLocation, useMatch } from 'react-router-dom'
import '@/styles/portal.css'
import { useUserAuth } from '@/contexts/userAuth'
import { useTheme } from '@/lib/useTheme'
import { api, type SetupSession } from '@/lib/api'
import { initials } from './portalUtils'

export interface PortalContext {
  sessions: SetupSession[]
  sessionsLoading: boolean
  loadSessions: () => void
  uniqueId: string
  email: string | null
  /** Gates the full_stack mode. Read fresh from the DB, not the JWT. */
  betaAccess: boolean
}

export function Portal() {
  const { user, logout, loading } = useUserAuth()
  const { toggle: toggleTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const matchSession = useMatch('/portal/session/:id')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [sessions, setSessions] = useState<SetupSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [betaAccess, setBetaAccess] = useState(false)

  // Split in two: the fetch never raises the spinner, so the mount effect below
  // does no synchronous setState (`sessionsLoading` already starts true). The
  // exported `loadSessions` — what child views call after creating or deleting
  // an agent — raises it, which is the only case where it is visible anyway.
  const fetchSessions = useCallback(
    () => api.listSessions()
      .then(setSessions)
      .catch((err: { status?: number }) => {
        if (err.status === 401) logout()
      })
      .finally(() => setSessionsLoading(false)),
    [logout],
  )

  const loadSessions = useCallback(() => {
    setSessionsLoading(true)
    void fetchSessions()
  }, [fetchSessions])

  useEffect(() => {
    if (!loading && !user) navigate('/login', { replace: true })
  }, [loading, user, navigate])

  useEffect(() => {
    if (user) void fetchSessions()
  }, [user, fetchSessions])

  useEffect(() => {
    if (user) {
      api.getMe()
        .then(me => { setEmail(me.email); setBetaAccess(me.beta_access) })
        .catch(() => {})
    }
  }, [user])

  useEffect(() => {
    if (!userMenuOpen) return
    const close = () => setUserMenuOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [userMenuOpen])

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  function goTo(path: string) {
    navigate(path)
    setDrawerOpen(false)
    window.scrollTo({ top: 0 })
  }

  if (loading) return (
    <div className="portal-root" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <p>Loading…</p>
    </div>
  )
  if (!user) return null

  const path = location.pathname
  const sessionId = matchSession?.params.id ?? null
  // The trail below "Portal". Every entry but the last is a link, so a page
  // that sits inside a section can name the section and go back to it — an
  // agent's detail page is reached from the list and belongs under it.
  //
  // The agent's name comes straight from the route param, so this is right
  // before the session list has loaded rather than after.
  const trail: Array<{ label: string; path?: string }> =
    path.includes('/create') ? [{ label: 'Create VTA' }]
    : matchSession ? [{ label: 'Agents', path: '/portal' }, { label: sessionId ?? 'Detail' }]
    : path.includes('/domains') ? [{ label: 'Domains' }]
    : path.includes('/settings') ? [{ label: 'Settings' }]
    : [{ label: 'Agents' }]
  const isDomains = path.includes('/domains')
  const isAgents = path.replace(/\/$/, '') === '/portal' ||
    (!path.includes('/create') && !matchSession && !path.includes('/settings') && !isDomains)

  return (
    <div className="portal-root">
      <div className="p-app" data-drawer={drawerOpen ? 'open' : undefined}>
        {/* Sidebar */}
        <aside className="p-sidebar">
          <div className="sidebar-head">
            <a className="sidebar-brand" href="/portal">
              <span className="sidebar-mark"/>
              <span>VTA Farm</span>
            </a>
          </div>
          <div className="sidebar-section">
            <div className="s-title">Workspace</div>
            <div
              className={`nav-item ${isAgents ? 'active' : ''}`}
              onClick={() => goTo('/portal')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
              Agents
            </div>
            {/* Top level, next to Agents: a domain has to be verified *before*
                an agent is created, so burying it under Settings would hide the
                only step that has to come first. */}
            <div
              className={`nav-item ${isDomains ? 'active' : ''}`}
              onClick={() => goTo('/portal/domains')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              Domains
            </div>
          </div>
          <div className="sidebar-foot">
            <div className="user-pop" data-open={userMenuOpen ? 'true' : 'false'}>
              <div className="user-menu" role="menu">
                <div className="menu-item" onClick={() => { setUserMenuOpen(false); goTo('/portal/settings') }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                  Settings
                </div>
                <div className="menu-sep" />
                <div className="menu-item destructive" onClick={() => { setUserMenuOpen(false); handleLogout() }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
                  Sign out
                </div>
              </div>
              <div className="user-chip" onClick={e => { e.stopPropagation(); setUserMenuOpen(v => !v) }}>
                <span className="p-avatar">{initials(user.unique_id)}</span>
                <div className="meta grow">
                  {email
                    ? <div className="n">{email}</div>
                    : <div className="n" style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{user.unique_id}</div>}
                  <div className="e">User account</div>
                </div>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 15, height: 15, color: 'hsl(var(--muted-foreground))' }}><path d="m18 15-6-6-6 6"/></svg>
              </div>
            </div>
          </div>
        </aside>

        <div className="drawer-scrim" onClick={() => setDrawerOpen(false)} />

        {/* Main */}
        <div className="p-main">
          <header className="p-topbar">
            <button className="btn btn-ghost btn-icon btn-sm menu-btn" onClick={() => setDrawerOpen(v => !v)} aria-label="Open menu">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 12h18M3 6h18M3 18h18"/></svg>
            </button>
            <div className="crumb">
              <button type="button" className="root" onClick={() => goTo('/portal')}>Portal</button>
              {/* Positional key: the trail is fixed-length per route, and the
                  leaf label is user-chosen, so it is not a safe id. */}
              {trail.map((c, i) => (
                <Fragment key={i}>
                  <span className="sep">/</span>
                  {i < trail.length - 1 && c.path
                    ? <button type="button" className="root" onClick={() => goTo(c.path!)}>{c.label}</button>
                    : <span className="cur">{c.label}</span>}
                </Fragment>
              ))}
            </div>
            <div className="spacer"/>
            <button className="btn btn-ghost btn-icon btn-sm theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
              <svg className="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
              <svg className="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
            </button>
          </header>

          <Outlet context={{ sessions, sessionsLoading, loadSessions, uniqueId: user.unique_id, email, betaAccess } satisfies PortalContext} />
        </div>
      </div>
    </div>
  )
}
