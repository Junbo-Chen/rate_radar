import { useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import type { SourceKind } from './api/client'
import { ThemeToggle } from './components/ThemeToggle'
import { TimezoneProvider } from './hooks/useTimezone'
import { CredentialsPage } from './pages/CredentialsPage'
import { DashboardPage } from './pages/DashboardPage'
import './App.css'

const PAGES = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/credentials', label: 'Credentials', end: false },
]

function AppInner() {
  // De bronkeuze staat hier, niet in een pagina: beide schermen praten met
  // dezelfde back-end, en de keuze moet een navigatie overleven.
  const [source, setSource] = useState<SourceKind>('mock')

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1 className="app__title">RateRadar</h1>
          <p className="app__tagline">API-limieten per Lightspeed-webshop</p>
        </div>

        <div className="app__header-side">
          <nav className="app__nav" aria-label="Hoofdmenu">
            {PAGES.map((page) => (
              <NavLink key={page.to} to={page.to} end={page.end} className="app__nav-link">
                {page.label}
              </NavLink>
            ))}
          </nav>
          <ThemeToggle />
        </div>
      </header>

      <Routes>
        <Route path="/" element={<DashboardPage source={source} onSourceChange={setSource} />} />
        <Route path="/credentials" element={<CredentialsPage source={source} />} />
        <Route
          path="*"
          element={<p className="app__placeholder">Deze pagina bestaat niet.</p>}
        />
      </Routes>
    </div>
  )
}

export default function App() {
  return (
    <TimezoneProvider>
      <AppInner />
    </TimezoneProvider>
  )
}
