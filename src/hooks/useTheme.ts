import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'rateradar:theme'

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    // Privémodus of geblokkeerde opslag: dan volgen we gewoon het systeem.
  }
  return 'system'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readStoredTheme)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') {
      root.removeAttribute('data-theme')
    } else {
      root.setAttribute('data-theme', theme)
    }
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Niet kunnen onthouden is geen reden om het thema niet toe te passen.
    }
  }, [theme])

  const cycle = useCallback(() => {
    setTheme((current) => (current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system'))
  }, [])

  return { theme, cycle }
}
