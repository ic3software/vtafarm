import { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import '@/styles/portal.css'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import { useTheme } from '@/lib/useTheme'
import { initials } from '../portal/portalUtils'

export interface AdminContext {
  email: string
}

export function AdminPanel() {
  const { admin, logout, loading } = useAdminAuth()
  const { toggle: toggleTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  useEffect(() => {
    if (!loading && !admin) navigate('/admin/login', { replace: true })
  }, [loading, admin, navigate])

  useEffect(() => {
    if (!userMenuOpen) return
    const close = () => setUserMenuOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [userMenuOpen])

  async function handleLogout() {
    await logout()
    navigate('/admin/login', { replace: true })
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
  if (!admin) return null

  const path = location.pathname
  const crumb = path.includes('/settings') ? 'Settings'
    : path.includes('/users') ? 'Users'
    : 'Admins'

  return (
    <div className="portal-root">
      <div className="p-app" data-drawer={drawerOpen ? 'open' : undefined}>
        {/* Sidebar */}
        <aside className="p-sidebar">
          <div className="sidebar-head">
            <a className="sidebar-brand" href="/admin">
              <span className="sidebar-mark"/>
              <span>Cipher</span>
              <span className="admin-pill">Admin</span>
            </a>
          </div>

          <div className="sidebar-section">
            <div className="s-title">Control plane</div>
            <div
              className={`nav-item ${!path.includes('/users') && !path.includes('/settings') ? 'active' : ''}`}
              onClick={() => goTo('/admin')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Admins
            </div>
            <div
              className={`nav-item ${path.includes('/users') ? 'active' : ''}`}
              onClick={() => goTo('/admin/users')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Users
            </div>
          </div>

          <div className="sidebar-foot">
            <div className="user-pop" data-open={userMenuOpen ? 'true' : 'false'}>
              <div className="user-menu" role="menu">
                <div className="menu-item" onClick={() => { setUserMenuOpen(false); goTo('/admin/settings') }}>
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
                <span className="p-avatar" style={{ background: 'hsl(var(--primary))', color: '#fff' }}>{initials(admin.email)}</span>
                <div className="meta grow">
                  <div className="n">{admin.email}</div>
                  <div className="e">Admin account</div>
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
              <span>Admin</span><span className="sep">/</span>
              <span className="cur">{crumb}</span>
            </div>
            <div className="spacer"/>
            <button className="btn btn-ghost btn-icon btn-sm theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
              <svg className="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
              <svg className="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
            </button>
          </header>

          <Outlet context={{ email: admin.email } satisfies AdminContext} />
        </div>
      </div>
    </div>
  )
}
