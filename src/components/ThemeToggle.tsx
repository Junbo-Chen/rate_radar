import { useTheme, type Theme } from '../hooks/useTheme'
import './ThemeToggle.css'

const LABELS: Record<Theme, string> = {
  system: 'Systeem',
  light: 'Licht',
  dark: 'Donker',
}

/** Zon, maan, of een half gevulde cirkel voor "volg het systeem". */
function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === 'light') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="3.4" fill="currentColor" />
        <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M8 1v1.8M8 13.2V15M1 8h1.8M13.2 8H15" />
          <path d="M3.05 3.05l1.27 1.27M11.68 11.68l1.27 1.27M12.95 3.05l-1.27 1.27M4.32 11.68l-1.27 1.27" />
        </g>
      </svg>
    )
  }

  if (theme === 'dark') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M13.4 9.9A5.9 5.9 0 016.1 2.6a5.9 5.9 0 107.3 7.3z" fill="currentColor" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 1.9a6.1 6.1 0 010 12.2z" fill="currentColor" />
    </svg>
  )
}

/** De volgorde die `cycle()` aanhoudt, zodat het label kan vertellen wat er komt. */
const NEXT: Record<Theme, Theme> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
}

export function ThemeToggle() {
  const { theme, cycle } = useTheme()

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={cycle}
      aria-label={`Thema staat op ${LABELS[theme].toLowerCase()}. Klik voor ${LABELS[
        NEXT[theme]
      ].toLowerCase()}.`}
      title={`Wisselen naar ${LABELS[NEXT[theme]].toLowerCase()}`}
    >
      <span className="theme-toggle__icon" key={theme}>
        <ThemeIcon theme={theme} />
      </span>
      {LABELS[theme]}
    </button>
  )
}
