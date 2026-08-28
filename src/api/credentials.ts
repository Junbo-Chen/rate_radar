/**
 * CRUD voor de API-credentials van een Lightspeed-webshop.
 *
 * Uitgangspunt: een secret gaat er wél in, maar komt er nooit meer uit. De
 * back-end slaat het versleuteld op en geeft alleen een hint terug (de laatste
 * vier tekens), zodat je in de lijst kunt zien wélke sleutel er staat zonder
 * dat het secret over de lijn gaat. Zo werkt elke serieuze credential-API, en
 * het scheelt Eric een hoop kopzorgen bij het inleveren.
 */

import { apiFetch, readJson } from './http'

export interface Credential {
  id: string
  store_id: string
  /** Mag gemaskeerd zijn; de key is minder gevoelig dan het secret. */
  api_key: string
  /** Laatste vier tekens van het secret. Nooit de volledige waarde. */
  api_secret_last4: string
  created_at: string
  /**
   * Aantal 429's dat voor deze webshop is gelogd. Optioneel: alleen de back-end
   * kan dit per store weten, want de metingen zelf dragen geen store_id.
   * Ontbreekt het, dan valt de UI terug op een telling over de geladen metingen.
   */
  hits_429?: number
}

/** Wat de UI verstuurt bij aanmaken of bijwerken. */
export interface CredentialInput {
  store_id: string
  api_key: string
  /** Leeg laten bij bewerken betekent: secret ongewijzigd laten. */
  api_secret: string
}

export const CREDENTIALS_URL =
  import.meta.env.VITE_CREDENTIALS_URL ?? 'http://localhost:8000/api/credentials'

export function lastFour(secret: string): string {
  return secret.slice(-4).padStart(4, '•')
}

/** Toont genoeg om een sleutel te herkennen, niet genoeg om hem te gebruiken. */
export function maskKey(key: string): string {
  if (key.length <= 8) return `${key.slice(0, 2)}••••`
  return `${key.slice(0, 4)}••••${key.slice(-4)}`
}

export function validate(input: CredentialInput, isEdit: boolean): string | null {
  if (!input.store_id.trim()) return 'Store ID is verplicht.'
  if (!/^[\w-]+$/.test(input.store_id.trim())) {
    return 'Store ID mag alleen letters, cijfers, - en _ bevatten.'
  }
  if (!input.api_key.trim()) return 'API key is verplicht.'
  if (!isEdit && !input.api_secret.trim()) return 'API secret is verplicht.'
  if (input.api_secret.trim() && input.api_secret.trim().length < 8) {
    return 'API secret lijkt te kort — verwacht minstens 8 tekens.'
  }
  return null
}

export interface CredentialsDriver {
  list(signal?: AbortSignal): Promise<Credential[]>
  create(input: CredentialInput): Promise<Credential>
  update(id: string, input: CredentialInput): Promise<Credential>
  remove(id: string): Promise<void>
}

/* ------------------------------------------------------------------ *
 * Live: Eric's Laravel-endpoints
 * ------------------------------------------------------------------ */

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  // apiFetch regelt het sessiecookie en het CSRF-token; readJson vertaalt
  // Laravel's { message, errors } naar een bruikbare exceptie.
  const response = await apiFetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })

  return readJson<T>(response, url)
}

export const httpDriver: CredentialsDriver = {
  list: (signal) => request<Credential[]>(CREDENTIALS_URL, { signal }),
  create: (input) =>
    request<Credential>(CREDENTIALS_URL, { method: 'POST', body: JSON.stringify(input) }),
  update: (id, input) =>
    request<Credential>(`${CREDENTIALS_URL}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  remove: (id) =>
    request<void>(`${CREDENTIALS_URL}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}

/**
 * Credentials worden uitsluitend door de back-end bewaard.
 *
 * Er stond hier eerder een lokale variant die in localStorage schreef. Die is
 * verwijderd: localStorage is geen kluis — alles wat daar staat is leesbaar
 * voor elk script op deze origin, en een API-sleutel hoort daar niet thuis.
 */
export const credentialsDriver: CredentialsDriver = httpDriver

/**
 * Ruimt de sleutel op die de oude lokale opslag achterliet, zodat er niets
 * blijft rondslingeren in de browsers waar dit al gedraaid heeft.
 */
export function purgeLegacyLocalCredentials() {
  try {
    localStorage.removeItem('rateradar:credentials')
  } catch {
    // Geblokkeerde opslag: dan valt er ook niets op te ruimen.
  }
}
