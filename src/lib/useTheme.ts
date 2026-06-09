import { useState, useEffect } from 'react'

const THEME_KEY = 'cipher-theme'

export function useTheme() {
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY)
      if (saved) return saved === 'dark'
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    } catch {
      return false
    }
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light') } catch {}
  }, [dark])

  return { dark, toggle: () => setDark(d => !d) }
}
