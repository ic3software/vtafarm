import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/lib/useTheme'

/** The light and dark switch, the same button as on the public site. */
export function ThemeToggle() {
  const { dark, toggle } = useTheme()
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <button type="button" onClick={toggle} className="icon-btn" aria-label={label} title={label}>
      {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </button>
  )
}
