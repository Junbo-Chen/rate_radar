import type { ReactNode } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ThemeToggle } from './components/ThemeToggle'
import { UserMenu } from './components/UserMenu'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { TimezoneProvider } from './hooks/useTimezone'
import { CredentialsPage } from './pages/CredentialsPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import './App.css'

const PAGES = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/credentials', label: 'Credentials', end: false },
]

/**
 * Laat de pagina alleen zien aan wie ingelogd is. Het gevraagde pad gaat mee
 * naar het inlogscherm, zodat je na het inloggen alsnog belandt waar je heen wilde.
 */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <p className="app__placeholder">Bezig met laden...</p>
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />

  return <>{children}</>
}

/** Inloggen en registreren hebben geen zin meer zodra je al ingelogd bent. */
function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()

  if (isLoading) return <p className="app__placeholder">Bezig met laden...</p>
  if (user) return <Navigate to="/" replace />

  return <>{children}</>
}

function AppInner() {
  const { user, signOut } = useAuth()

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1 className="app__title">RateRadar</h1>
          <p className="app__tagline">API-limieten per Lightspeed-webshop</p>
        </div>

        <div className="app__header-side">
          {/* Zonder sessie leiden deze links nergens heen, dus tonen we ze niet. */}
          {user && (
            <nav className="app__nav" aria-label="Hoofdmenu">
              {PAGES.map((page) => (
                <NavLink key={page.to} to={page.to} end={page.end} className="app__nav-link">
                  {page.label}
                </NavLink>
              ))}
            </nav>
          )}

          {/* Ingelogd zit de themaknop in het accountmenu. Op het inlogscherm is
              er geen menu, dus staat hij daar los in de header. */}
          {user ? (
            <UserMenu user={user} onSignOut={() => void signOut()} />
          ) : (
            <ThemeToggle />
          )}
        </div>
      </header>

      <Routes>
        <Route
          path="/login"
          element={
            <RedirectIfAuthenticated>
              <LoginPage />
            </RedirectIfAuthenticated>
          }
        />
        <Route
          path="/register"
          element={
            <RedirectIfAuthenticated>
              <RegisterPage />
            </RedirectIfAuthenticated>
          }
        />
        <Route
          path="/"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/credentials"
          element={
            <RequireAuth>
              <CredentialsPage />
            </RequireAuth>
          }
        />
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
    <AuthProvider>
      <TimezoneProvider>
        <AppInner />
      </TimezoneProvider>
    </AuthProvider>
  )
}
