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
                <strong>Get a VTA</strong>
              </span>
              <ArrowRight aria-hidden="true" className="transition-transform group-hover:translate-x-1" />
            </a>

            <button type="button" onClick={onCreateAccount} className="home-start-option group">
              <span>
                <strong>Create a VTA Farm account</strong>
              </span>
              <ArrowRight aria-hidden="true" className="transition-transform group-hover:translate-x-1" />
            </button>
          </div>

        </div>
      </main>
    </div>
  )
}
