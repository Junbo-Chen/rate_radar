import { useCallback, useEffect, useRef, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'rateradar:theme'

/** Zet kort een crossfade aan over alles wat kleur draagt. Zie index.css. */
const SWITCHING_CLASS = 'theme-switching'
const SWITCH_MS = 220

export function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    // Privémodus of geblokkeerde opslag: dan volgen we gewoon het systeem.
  }
  return 'system'
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readStoredTheme)

  // Bij de eerste render heeft het inline-script in index.html het thema al
  // gezet. Daar hoort geen animatie bij: die zou als een flits bij het laden
  // overkomen in plaats van als een bewuste wissel.
  const isFirstRun = useRef(true)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Niet kunnen onthouden is geen reden om het thema niet toe te passen.
    }

    if (isFirstRun.current) {
      isFirstRun.current = false
      applyTheme(theme)
      return
    }

    const root = document.documentElement
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduceMotion) {
      applyTheme(theme)
      return
    }

    root.classList.add(SWITCHING_CLASS)
    applyTheme(theme)

    const timer = setTimeout(() => root.classList.remove(SWITCHING_CLASS), SWITCH_MS)
    return () => {
      clearTimeout(timer)
      root.classList.remove(SWITCHING_CLASS)
    }
  }, [theme])

  const cycle = useCallback(() => {
    setTheme((current) => (current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system'))
  }, [])

  return { theme, cycle }
}
