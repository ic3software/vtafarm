import { useState, useEffect, useCallback } from 'react'
import { Outlet, useNavigate, useLocation, useMatch } from 'react-router-dom'
import '@/styles/portal.css'
import { useUserAuth } from '@/contexts/UserAuthContext'
import { useTheme } from '@/lib/useTheme'
import { api, type SetupSession } from '@/lib/api'
import { initials } from './portalUtils'

export interface PortalContext {
  sessions: SetupSession[]
  sessionsLoading: boolean
  loadSessions: () => void
  uniqueId: string
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

  const loadSessions = useCallback(() => {
    setSessionsLoading(true)
    api.listSessions()
      .then(setSessions)
      .catch((err: { status?: number }) => {
        if (err.status === 401) logout()
      })
      .finally(() => setSessionsLoading(false))
  }, [logout])

  useEffect(() => {
    if (!loading && !user) navigate('/login', { replace: true })
  }, [loading, user, navigate])

  useEffect(() => {
    if (user) loadSessions()
  }, [user, loadSessions])

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
  const crumb = path.includes('/create') ? 'Create VTA'
    : matchSession ? (sessions.find(s => s.id === sessionId)?.vta_name ?? 'Detail')
    : path.includes('/settings') ? 'Settings'
    : 'Agents'
  const isAgents = path === '/portal' || (!path.includes('/create') && !matchSession && !path.includes('/settings'))

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
                  <div className="n" style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{user.unique_id}</div>
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
              <span>Portal</span><span className="sep">/</span>
              <span className="cur">{crumb}</span>
            </div>
            <div className="spacer"/>
            <button className="btn btn-ghost btn-icon btn-sm theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
              <svg className="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
              <svg className="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
            </button>
          </header>

          <Outlet context={{ sessions, sessionsLoading, loadSessions, uniqueId: user.unique_id } satisfies PortalContext} />
        </div>
      </div>
    </div>
  )
}
