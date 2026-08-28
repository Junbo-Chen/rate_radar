import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ValidationError } from '../api/http'
import { useAuth } from '../hooks/useAuth'
import './AuthPage.css'

export function RegisterPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  async function onSubmit(event: FormEvent) {
    event.preventDefault()

    // Deze controle staat ook in Laravel; hier scheelt het je een ronde wachten
    // op de server voor een fout die je zelf al kunt zien.
    if (password !== confirmation) {
      setFieldErrors({ password_confirmation: ['De twee wachtwoorden zijn niet gelijk.'] })
      return
    }

    setIsSaving(true)
    setError(null)
    setFieldErrors({})

    try {
      await signUp({ name, email, password, password_confirmation: confirmation })
      navigate('/', { replace: true })
    } catch (cause) {
      if (cause instanceof ValidationError) setFieldErrors(cause.errors)
      else setError(cause instanceof Error ? cause.message : 'Registreren mislukt.')
    } finally {
      setIsSaving(false)
    }
  }

  const errorFor = (field: string) => fieldErrors[field]?.[0]

  return (
    <section className="auth">
      <h2 className="auth__title">Account aanmaken</h2>

      {error && (
        <p className="auth__error" role="alert">
          {error}
        </p>
      )}

      <form onSubmit={onSubmit} noValidate>
        <div className="auth__field">
          <label className="auth__label" htmlFor="register-name">
            Naam
          </label>
          <input
            id="register-name"
            className="auth__input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            aria-invalid={errorFor('name') ? true : undefined}
            required
          />
          {errorFor('name') && <span className="auth__field-error">{errorFor('name')}</span>}
        </div>

        <div className="auth__field">
          <label className="auth__label" htmlFor="register-email">
            E-mailadres
          </label>
          <input
            id="register-email"
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
          <label className="auth__label" htmlFor="register-password">
            Wachtwoord
          </label>
          <input
            id="register-password"
            className="auth__input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            aria-invalid={errorFor('password') ? true : undefined}
            required
          />
          {errorFor('password') && <span className="auth__field-error">{errorFor('password')}</span>}
        </div>

        <div className="auth__field">
          <label className="auth__label" htmlFor="register-confirmation">
            Wachtwoord herhalen
          </label>
          <input
            id="register-confirmation"
            className="auth__input"
            type="password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="new-password"
            aria-invalid={errorFor('password_confirmation') ? true : undefined}
            required
          />
          {errorFor('password_confirmation') && (
            <span className="auth__field-error">{errorFor('password_confirmation')}</span>
          )}
        </div>

        <button type="submit" className="auth__submit" disabled={isSaving}>
          {isSaving ? 'Account aanmaken...' : 'Account aanmaken'}
        </button>
      </form>

      <p className="auth__switch">
        Heb je al een account? <Link to="/login">Inloggen</Link>
      </p>
    </section>
  )
}
