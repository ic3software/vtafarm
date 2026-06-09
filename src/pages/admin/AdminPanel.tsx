import { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import '@/styles/portal.css'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import { initials } from '../portal/portalUtils'

export interface AdminContext {
  email: string
}

export function AdminPanel() {
  const { admin, logout, loading } = useAdminAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    if (!loading && !admin) navigate('/admin/login', { replace: true })
  }, [loading, admin, navigate])

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
  const crumb = path.includes('/audit') ? 'Audit log'
    : path.includes('/security') ? 'Security'
    : 'Users'

  return (
    <div className="portal-root">
      <div className="p-app" data-drawer={drawerOpen ? 'open' : undefined}>
        {/* Sidebar */}
        <aside className="p-sidebar">
          <div className="sidebar-head">
            <a className="sidebar-brand" href="/">
              <span className="sidebar-mark"/>
              <span>Cipher</span>
              <span className="admin-pill">Admin</span>
            </a>
          </div>

          <div className="sidebar-section">
            <div className="s-title">Control plane</div>
            <div
              className={`nav-item ${path === '/admin/users' || path === '/admin' ? 'active' : ''}`}
              onClick={() => goTo('/admin/users')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Users
            </div>
            <div
              className={`nav-item ${path === '/admin/audit' ? 'active' : ''}`}
              onClick={() => goTo('/admin/audit')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 5h16M4 12h16M4 19h10"/></svg>
              Audit log
            </div>
          </div>

          <div className="sidebar-section">
            <div className="s-title">Account</div>
            <div
              className={`nav-item ${path === '/admin/security' ? 'active' : ''}`}
              onClick={() => goTo('/admin/security')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Security
            </div>
          </div>

          <div className="sidebar-foot">
            <div className="user-chip" onClick={() => goTo('/admin/security')}>
              <span className="p-avatar" style={{ background: 'hsl(var(--primary))', color: '#fff' }}>{initials(admin.email)}</span>
              <div className="meta grow">
                <div className="n">{admin.email}</div>
                <div className="e">Admin account</div>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 15, height: 15, color: 'hsl(var(--muted-foreground))' }}><path d="m18 15-6-6-6 6"/></svg>
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
            {path === '/admin/users' || path === '/admin' ? (
              <button className="btn btn-outline btn-sm" onClick={() => goTo('/admin/users')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>
                New user
              </button>
            ) : null}
            <button className="btn btn-ghost btn-icon btn-sm" onClick={handleLogout} title="Sign out">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            </button>
          </header>

          <Outlet context={{ email: admin.email } satisfies AdminContext} />
        </div>
      </div>
    </div>
  )
}
