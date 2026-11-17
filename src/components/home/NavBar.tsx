import { Moon, Sun } from 'lucide-react'
import { BrandMark } from '@/components/BrandMark'
import { useTheme } from '@/lib/useTheme'

export function NavBar() {
  const { dark, toggle } = useTheme()

  return (
    <header className="home-simple-nav">
      <nav className="home-simple-nav-inner" aria-label="Main">
        <a href="/" className="home-simple-brand">
          <BrandMark />
          VTA Farm
        </a>
        <div className="home-simple-nav-actions">
          <button
            type="button"
            onClick={toggle}
            className="home-theme-toggle"
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>
        </div>
      </nav>
    </header>
  )
}
