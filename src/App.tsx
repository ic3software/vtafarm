import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { NavBar } from '@/components/home/NavBar'
import { HeroSection } from '@/components/home/HeroSection'
import { HowItWorks } from '@/components/home/HowItWorks'
import { FeaturesSection } from '@/components/home/FeaturesSection'
import { BenefitsSection } from '@/components/home/BenefitsSection'
import { CtaSection } from '@/components/home/CtaSection'
import { FooterSection } from '@/components/home/FooterSection'
import { MobilePreview } from '@/pages/MobilePreview'
import { UserLogin } from '@/pages/UserLogin'
import { AdminLogin } from '@/pages/AdminLogin'
import { Portal } from '@/pages/portal/Portal'
import { AgentsView } from '@/pages/portal/AgentsView'
import { CreateVTAView } from '@/pages/portal/CreateVTAView'
import { SessionDetailView } from '@/pages/portal/SessionDetailView'
import { SettingsView } from '@/pages/portal/SettingsView'
import { AdminPanel } from '@/pages/admin/AdminPanel'
import { UsersView } from '@/pages/admin/UsersView'
import { AuditView } from '@/pages/admin/AuditView'
import { SecurityView } from '@/pages/admin/SecurityView'
import { UserAuthProvider } from '@/contexts/UserAuthContext'
import { AdminAuthProvider } from '@/contexts/AdminAuthContext'

function HomePage() {
  return (
    <>
      <NavBar />
      <main>
        <HeroSection />
        <HowItWorks />
        <FeaturesSection />
        <BenefitsSection />
        <CtaSection />
      </main>
      <FooterSection />
    </>
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
          <Route path="/portal" element={<Portal />}>
            <Route index element={<AgentsView />} />
            <Route path="create" element={<CreateVTAView />} />
            <Route path="session/:id" element={<SessionDetailView />} />
            <Route path="settings" element={<SettingsView />} />
          </Route>

          {/* AdminAuthProvider scoped to /admin/* only */}
          <Route path="/admin" element={<AdminAuthProvider><Outlet /></AdminAuthProvider>}>
            <Route path="login" element={<AdminLogin />} />
            <Route element={<AdminPanel />}>
              <Route index element={<Navigate to="users" replace />} />
              <Route path="users" element={<UsersView />} />
              <Route path="audit" element={<AuditView />} />
              <Route path="security" element={<SecurityView />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </UserAuthProvider>
    </BrowserRouter>
  )
}
