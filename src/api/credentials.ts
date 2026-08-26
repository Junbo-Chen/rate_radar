/**
 * CRUD voor de API-credentials van een Lightspeed-webshop.
 *
 * Uitgangspunt: een secret gaat er wél in, maar komt er nooit meer uit. De
 * back-end slaat het versleuteld op en geeft alleen een hint terug (de laatste
 * vier tekens), zodat je in de lijst kunt zien wélke sleutel er staat zonder
 * dat het secret over de lijn gaat. Zo werkt elke serieuze credential-API, en
 * het scheelt Eric een hoop kopzorgen bij het inleveren.
 */

export interface Credential {
  id: string
  store_id: string
  /** Mag gemaskeerd zijn; de key is minder gevoelig dan het secret. */
  api_key: string
  /** Laatste vier tekens van het secret. Nooit de volledige waarde. */
  api_secret_last4: string
  created_at: string
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
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new Error(`Geen verbinding met ${url}. Draait de Laravel-server al?`)
  }

  if (response.status === 204) return undefined as T
  if (!response.ok) {
    // Laravel geeft validatiefouten als { message, errors }.
    const problem = await response.json().catch(() => null)
    const message =
      problem && typeof problem.message === 'string'
        ? problem.message
        : `${url} gaf HTTP ${response.status} ${response.statusText}.`
    throw new Error(message)
  }

  const body = await response.json()
  // Laravel's resources verpakken standaard in { data: ... }.
  return (body && typeof body === 'object' && 'data' in body ? body.data : body) as T
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

/* ------------------------------------------------------------------ *
 * Lokaal: een stub zolang de back-end er nog niet is
 * ------------------------------------------------------------------ */

const STORAGE_KEY = 'rateradar:credentials'

/**
 * Bewaart bewust alléén de hint van het secret, niet het secret zelf.
 * localStorage is geen kluis: alles wat daar staat is leesbaar voor elk script
 * op deze origin. De volledige waarde hoort in Eric's versleutelde kolom.
 */
function read(): Credential[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function write(rows: Credential[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
  } catch {
    // Vol of geblokkeerd: de lijst blijft dan alleen in het geheugen staan.
  }
}

export const localDriver: CredentialsDriver = {
  async list() {
    return read()
  },

  async create(input) {
    const row: Credential = {
      id: crypto.randomUUID(),
      store_id: input.store_id.trim(),
      api_key: input.api_key.trim(),
      api_secret_last4: lastFour(input.api_secret.trim()),
      created_at: new Date().toISOString(),
    }
    write([...read(), row])
    return row
  },

  async update(id, input) {
    const rows = read()
    const index = rows.findIndex((row) => row.id === id)
    if (index === -1) throw new Error('Deze credential bestaat niet meer.')

    const updated: Credential = {
      ...rows[index],
      store_id: input.store_id.trim(),
      api_key: input.api_key.trim(),
      // Leeg secret bij bewerken = ongewijzigd laten.
      api_secret_last4: input.api_secret.trim()
        ? lastFour(input.api_secret.trim())
        : rows[index].api_secret_last4,
    }
    rows[index] = updated
    write(rows)
    return updated
  },

  async remove(id) {
    write(read().filter((row) => row.id !== id))
  },
}

export function driverFor(useLive: boolean): CredentialsDriver {
  return useLive ? httpDriver : localDriver
}
