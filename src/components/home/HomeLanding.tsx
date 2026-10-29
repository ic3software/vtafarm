import { ArrowRight } from 'lucide-react'
import { NavBar } from '@/components/home/NavBar'

type HomeLandingProps = {
  onCreateAccount: () => void
}

export function HomeLanding({ onCreateAccount }: HomeLandingProps) {
  return (
    <div className="home-page">
      <NavBar />

      <main className="home-simple-main">
        <div className="home-simple-content">
          <div className="eyebrow"><span className="dot" />Hosted Verifiable Trust Agents</div>
          <h1>VTA Farm</h1>

          <div className="home-start-options" aria-label="Get started with VTA Farm">
            <a href="/get-started" className="home-start-option home-start-option-primary group">
              <span>
                <strong>Create your first Trust Agent</strong>
              </span>
              <ArrowRight aria-hidden="true" className="transition-transform group-hover:translate-x-1" />
            </a>

            <button type="button" onClick={onCreateAccount} className="home-start-option home-start-option-secondary group">
              <span>
                <strong>Set up an account</strong>
              </span>
              <ArrowRight aria-hidden="true" className="transition-transform group-hover:translate-x-1" />
            </button>

            <a href="/login" className="home-start-option home-start-option-secondary group">
              <span>
                <strong>Sign in to VTA Farm</strong>
              </span>
              <ArrowRight aria-hidden="true" className="transition-transform group-hover:translate-x-1" />
            </a>
          </div>

        </div>
      </main>
    </div>
  )
}
