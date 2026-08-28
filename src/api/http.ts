/**
 * Eén plek voor alle aanroepen naar Laravel.
 *
 * De sessie loopt via een cookie, niet via een token in localStorage: alles wat
 * daar staat is leesbaar voor elk script op deze origin. Dat betekent wel dat
 * elke aanroep `credentials: 'include'` nodig heeft, en dat schrijvende
 * verzoeken een CSRF-token mee moeten sturen.
 */

/** De origin van de Laravel-server, los van het pad naar een endpoint. */
export const BACKEND_ORIGIN = deriveBackendOrigin()

function deriveBackendOrigin(): string {
  const explicit = import.meta.env.VITE_BACKEND_URL
  if (explicit) return explicit.replace(/\/+$/, '')

  // Anders: dezelfde server als waar de metingen vandaan komen.
  try {
    return new URL(import.meta.env.VITE_API_URL ?? '', window.location.origin).origin
  } catch {
    return 'http://localhost:8000'
  }
}

/** Gegooid zodra Laravel zegt dat er geen geldige sessie (meer) is. */
export class UnauthenticatedError extends Error {
  constructor() {
    super('Je sessie is verlopen. Log opnieuw in.')
    this.name = 'UnauthenticatedError'
  }
}

/**
 * Laravel geeft validatiefouten per veld terug. Die houden we vast, zodat een
 * formulier de melding bij het juiste invoerveld kan zetten.
 */
export class ValidationError extends Error {
  readonly errors: Record<string, string[]>

  constructor(message: string, errors: Record<string, string[]>) {
    super(message)
    this.name = 'ValidationError'
    this.errors = errors
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Haalt het XSRF-cookie op als het er nog niet is. Laravel zet dat cookie via
 * /sanctum/csrf-cookie; zonder dat token weigert hij elk schrijvend verzoek.
 */
export async function ensureCsrfCookie(): Promise<void> {
  if (readCookie('XSRF-TOKEN')) return

  await fetch(`${BACKEND_ORIGIN}/sanctum/csrf-cookie`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
}

/**
 * Doet één aanroep naar Laravel, met sessiecookie en CSRF-token erbij.
 *
 * Een 401 wordt hier omgezet in een UnauthenticatedError én gemeld aan de rest
 * van de app, zodat er niet op tien plekken een eigen afhandeling hoeft te staan.
 */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase()

  if (UNSAFE.has(method)) await ensureCsrfCookie()

  const token = readCookie('XSRF-TOKEN')

  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(token ? { 'X-XSRF-TOKEN': token } : {}),
        ...init.headers,
      },
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new Error(`Geen verbinding met ${url}. Draait de Laravel-server al?`)
  }

  if (response.status === 401) {
    // De rest van de app luistert hierop en stuurt je terug naar het inlogscherm.
    window.dispatchEvent(new CustomEvent('auth:unauthenticated'))
    throw new UnauthenticatedError()
  }

  return response
}

/** Leest het antwoord uit en vertaalt Laravel's foutvormen naar excepties. */
export async function readJson<T>(response: Response, url: string): Promise<T> {
  if (response.status === 204) return undefined as T

  if (!response.ok) {
    const problem = await response.json().catch(() => null)

    if (response.status === 422 && problem?.errors) {
      throw new ValidationError(problem.message ?? 'De ingevulde gegevens kloppen niet.', problem.errors)
    }

    throw new Error(
      typeof problem?.message === 'string'
        ? problem.message
        : `${url} gaf HTTP ${response.status} ${response.statusText}.`,
    )
  }

  const body = await response.json().catch(() => null)

  // Laravel's resources verpakken standaard in { data: ... }.
  return (body && typeof body === 'object' && 'data' in body ? body.data : body) as T
}
