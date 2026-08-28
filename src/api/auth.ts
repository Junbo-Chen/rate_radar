/**
 * Inloggen, registreren en uitloggen tegen Laravel Fortify.
 *
 * Fortify's routes staan niet onder /api maar op de root van de server, dus die
 * bouwen we hier zelf op vanaf de origin.
 */
import { apiFetch, BACKEND_ORIGIN, readJson } from './http'

export interface User {
  id: number
  name: string
  email: string
}

export interface LoginInput {
  email: string
  password: string
  remember?: boolean
}

export interface RegisterInput {
  name: string
  email: string
  password: string
  password_confirmation: string
}

/** De ingelogde gebruiker, of null wanneer er geen sessie is. */
export async function currentUser(signal?: AbortSignal): Promise<User | null> {
  try {
    const response = await apiFetch(`${BACKEND_ORIGIN}/api/user`, { signal })
    return await readJson<User>(response, '/api/user')
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    // Niet ingelogd is hier geen fout maar een antwoord.
    return null
  }
}

export async function login(input: LoginInput): Promise<void> {
  const response = await apiFetch(`${BACKEND_ORIGIN}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  const result = await readJson<{ two_factor?: boolean }>(response, '/login')

  if (result?.two_factor) {
    throw new Error(
      'Voor dit account staat tweestapsverificatie aan. Dat kan nog niet in dit dashboard — log in via de Laravel-pagina op /login.',
    )
  }
}

export async function register(input: RegisterInput): Promise<void> {
  const response = await apiFetch(`${BACKEND_ORIGIN}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  await readJson(response, '/register')
}

export async function logout(): Promise<void> {
  const response = await apiFetch(`${BACKEND_ORIGIN}/logout`, { method: 'POST' })
  await readJson(response, '/logout')
}
