import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ValidationError } from '../api/http'
import { useAuth } from '../hooks/useAuth'
import './AuthPage.css'

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  // Kwam je hier omdat je een afgeschermde pagina opvroeg? Dan gaan we daar na
  // het inloggen alsnog heen, in plaats van altijd naar het dashboard.
  const intended = (location.state as { from?: string } | null)?.from ?? '/'

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setIsSaving(true)
    setError(null)
    setFieldErrors({})

    try {
      await signIn({ email, password, remember })
      navigate(intended, { replace: true })
    } catch (cause) {
      if (cause instanceof ValidationError) setFieldErrors(cause.errors)
      else setError(cause instanceof Error ? cause.message : 'Inloggen mislukt.')
    } finally {
      setIsSaving(false)
    }
  }

  const errorFor = (field: string) => fieldErrors[field]?.[0]

  return (
    <section className="auth">
      <h2 className="auth__title">Inloggen</h2>

      {error && (
        <p className="auth__error" role="alert">
          {error}
        </p>
      )}

      <form onSubmit={onSubmit} noValidate>
        <div className="auth__field">
          <label className="auth__label" htmlFor="login-email">
            E-mailadres
          </label>
          <input
            id="login-email"
            className="auth__input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            aria-invalid={errorFor('email') ? true : undefined}
            required
          />
          {errorFor('email') && <span className="auth__field-error">{errorFor('email')}</span>}
        </div>

        <div className="auth__field">
          <label className="auth__label" htmlFor="login-password">
            Wachtwoord
          </label>
          <input
            id="login-password"
            className="auth__input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            aria-invalid={errorFor('password') ? true : undefined}
            required
          />
          {errorFor('password') && <span className="auth__field-error">{errorFor('password')}</span>}
        </div>

        <label className="auth__remember">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          Ingelogd blijven op dit apparaat
        </label>

        <button type="submit" className="auth__submit" disabled={isSaving}>
          {isSaving ? 'Bezig met inloggen...' : 'Inloggen'}
        </button>
      </form>

      <p className="auth__switch">
        Nog geen account? <Link to="/register">Registreren</Link>
      </p>
    </section>
  )
}
