import { useState, useEffect } from 'react'

const THEME_KEY = 'vtafarm-theme'

export function useTheme() {
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY)
      if (saved === 'dark' || saved === 'light') return saved === 'dark'
    } catch { /* unreadable — fall through to the system preference */ }
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  // Follow system preference changes only when user hasn't manually overridden
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      try {
        if (!localStorage.getItem(THEME_KEY)) setDark(e.matches)
      } catch {
        setDark(e.matches)
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  const toggle = () =>
    setDark(d => {
      const next = !d
      // The toggle still applies; only the preference fails to persist.
      try { localStorage.setItem(THEME_KEY, next ? 'dark' : 'light') } catch { /* not persisted */ }
      return next
    })

  return { dark, toggle }
}
