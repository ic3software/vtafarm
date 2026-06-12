import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { MobilePreview } from '@/pages/MobilePreview'
import { UserLogin } from '@/pages/UserLogin'
import { AdminLogin } from '@/pages/AdminLogin'
import { Portal } from '@/pages/portal/Portal'
import { AgentsView } from '@/pages/portal/AgentsView'
import { CreateVTAView } from '@/pages/portal/CreateVTAView'
import { SessionDetailView } from '@/pages/portal/SessionDetailView'
import { SettingsView } from '@/pages/portal/SettingsView'
import { AdminPanel } from '@/pages/admin/AdminPanel'
import { AdminsView } from '@/pages/admin/AdminsView'
import { UsersView } from '@/pages/admin/UsersView'
import { InvitationsView } from '@/pages/admin/InvitationsView'
import { SecurityView } from '@/pages/admin/SecurityView'
import { Register } from '@/pages/Register'
import { AdminEnroll } from '@/pages/AdminEnroll'
import { UserAuthProvider } from '@/contexts/UserAuthContext'
import { AdminAuthProvider } from '@/contexts/AdminAuthContext'

function HomePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <div className="section-wrap flex flex-col items-center text-center">
        <h1
          className="font-serif font-normal leading-[1.05] tracking-[-0.02em]"
          style={{ fontSize: 'clamp(48px, 7vw, 96px)' }}
        >
          VTA Farm
        </h1>
        <p className="mt-5 max-w-[42ch] text-xl leading-[1.5]" style={{ color: 'var(--vtafarm-ink-2)' }}>
          A demo hosting service for Verifiable Trust Agents
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <a
            href="/portal"
            className="btn-ink group flex items-center gap-2 rounded-full px-5 py-3 text-[14.5px] font-medium"
          >
            Open Portal
            <span className="inline-block transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true">→</span>
          </a>
          <a
            href="https://github.com/OpenVTC/vti-setup/blob/main/developer/01-personal-vta.md"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost-light flex items-center gap-2 rounded-full px-5 py-3 text-[14.5px] font-medium"
          >
            Docs
          </a>
        </div>
      </div>
    </main>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <UserAuthProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/preview" element={<MobilePreview />} />

          <Route path="/login" element={<UserLogin />} />
          <Route path="/register/:token" element={<Register />} />
          <Route path="/portal" element={<Portal />}>
            <Route index element={<AgentsView />} />
            <Route path="create" element={<CreateVTAView />} />
            <Route path="session/:id" element={<SessionDetailView />} />
            <Route path="settings" element={<SettingsView />} />
          </Route>

          {/* AdminAuthProvider scoped to /admin/* only */}
          <Route path="/admin" element={<AdminAuthProvider><Outlet /></AdminAuthProvider>}>
            <Route path="login" element={<AdminLogin />} />
            <Route path="enroll/:token" element={<AdminEnroll />} />
            <Route element={<AdminPanel />}>
              <Route index element={<AdminsView />} />
              <Route path="users" element={<UsersView />} />
              <Route path="invitations" element={<InvitationsView />} />
              <Route path="settings" element={<SecurityView />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </UserAuthProvider>
    </BrowserRouter>
  )
}
