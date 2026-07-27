import { useState, type FormEvent } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { Mail, MailOpen } from 'lucide-react'
import { startRegistration } from '@simplewebauthn/browser'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useTheme } from '@/lib/useTheme'
import { MobilePreview } from '@/pages/MobilePreview'
import { UserLogin } from '@/pages/UserLogin'
import { AdminLogin } from '@/pages/AdminLogin'
import { Portal } from '@/pages/portal/Portal'
import { AgentsView } from '@/pages/portal/AgentsView'
import { CreateVTAView } from '@/pages/portal/CreateVTAView'
import { DomainsView } from '@/pages/portal/DomainsView'
import { SessionDetailView } from '@/pages/portal/SessionDetailView'
import { SettingsView } from '@/pages/portal/SettingsView'
import { AdminPanel } from '@/pages/admin/AdminPanel'
import { DashboardView } from '@/pages/admin/DashboardView'
import { AdminsView } from '@/pages/admin/AdminsView'
import { UsersView } from '@/pages/admin/UsersView'
import { SessionsView } from '@/pages/admin/SessionsView'
import { PlatformStackView } from '@/pages/admin/PlatformStackView'
import { InvitationsView } from '@/pages/admin/InvitationsView'
import { SecurityView } from '@/pages/admin/SecurityView'
import { Register } from '@/pages/Register'
import { Recover } from '@/pages/Recover'
import { AdminEnroll } from '@/pages/AdminEnroll'
import { UserAuthProvider, useUserAuth } from '@/contexts/UserAuthContext'
import { AdminAuthProvider } from '@/contexts/AdminAuthContext'

function HomePage() {
  const navigate = useNavigate()
  const { setUserSession } = useUserAuth()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [taken, setTaken] = useState(false)

  // Reset on OPEN, not close — the dialog stays mounted during its exit
  // animation, and resetting then would visibly swap its content mid-fade.
  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setEmail('')
      setError('')
      setTaken(false)
    }
  }

  async function submitSignup(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setTaken(false)
    try {
      // Creates the account (or resumes it while it still has no passkey) and
      // sets the login cookie, then runs the passkey ceremony. Retrying after
      // a cancelled/failed ceremony resumes the same account — no duplicates.
      const account = await api.signup(email.trim())
      const options = await api.passkeyRegisterBegin()
      const credential = await startRegistration({ optionsJSON: options.publicKey as never })
      await api.passkeyRegisterComplete('My Passkey', credential)
      setUserSession({ id: account.id, unique_id: account.unique_id, role: 'user' })
      navigate('/portal')
    } catch (err) {
      if ((err as { name?: string }).name === 'NotAllowedError') {
        setError('Passkey setup was cancelled — try again.')
      } else if ((err as { status?: number }).status === 409) {
        setTaken(true)
      } else {
        setError(err instanceof Error ? err.message : 'Sign-up failed — please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

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

        <button
          type="button"
          onClick={() => handleOpenChange(true)}
          className="btn-ghost-light group mt-4 flex items-center gap-2 rounded-full px-5 py-3 text-[14.5px] font-medium"
        >
          {/* Closed envelope crossfades into an open one on hover. */}
          <span className="relative size-4" aria-hidden="true">
            <Mail className="absolute inset-0 size-4 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:opacity-0" />
            <MailOpen className="absolute inset-0 size-4 opacity-0 transition-all duration-200 group-hover:opacity-100" />
          </span>
          Create account
        </button>

        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create your account</DialogTitle>
              <DialogDescription>
                Enter your email, then your device will prompt you to create a
                passkey — that's your login; there's no password and no
                confirmation email.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submitSignup} className="flex flex-col gap-3">
              <input
                type="email"
                name="email"
                required
                autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-label="Email address"
                autoComplete="email"
                data-1p-ignore=""
                data-bwignore=""
                data-lpignore="true"
                data-form-type="other"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
              />
              {taken && (
                <p className="text-sm text-destructive">
                  This email is already registered —{' '}
                  <a href="/login" className="underline">sign in</a> instead.
                </p>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" size="lg" disabled={busy} className="h-11 w-full text-[14.5px]">
                {busy ? 'Setting up…' : 'Sign up with Passkey'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  )
}

export default function App() {
  useTheme()
  return (
    <BrowserRouter>
      <UserAuthProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/preview" element={<MobilePreview />} />

          <Route path="/login" element={<UserLogin />} />
          <Route path="/register/:token" element={<Register />} />
          <Route path="/recover/:token" element={<Recover />} />
          <Route path="/portal" element={<Portal />}>
            <Route index element={<AgentsView />} />
            <Route path="create" element={<CreateVTAView />} />
            <Route path="domains" element={<DomainsView />} />
            <Route path="session/:id" element={<SessionDetailView />} />
            <Route path="settings" element={<SettingsView />} />
          </Route>

          {/* AdminAuthProvider scoped to /admin/* only */}
          <Route path="/admin" element={<AdminAuthProvider><Outlet /></AdminAuthProvider>}>
            <Route path="login" element={<AdminLogin />} />
            <Route path="enroll/:token" element={<AdminEnroll />} />
            <Route element={<AdminPanel />}>
              <Route index element={<DashboardView />} />
              <Route path="admins" element={<AdminsView />} />
              <Route path="users" element={<UsersView />} />
              <Route path="sessions" element={<SessionsView />} />
              <Route path="platform-stack" element={<PlatformStackView />} />
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
