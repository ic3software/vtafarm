import { BrandMark } from '@/components/BrandMark'
import { ThemeToggle } from '@/components/ThemeToggle'

export function NavBar() {
  return (
    <header className="home-simple-nav">
      <nav className="home-simple-nav-inner" aria-label="Main">
        <a href="/" className="home-simple-brand">
          <BrandMark />
          VTA Farm
        </a>
        <div className="home-simple-nav-actions">
          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}
