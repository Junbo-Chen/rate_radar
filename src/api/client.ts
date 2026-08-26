import { parseMeasurements, type Measurement } from './contract'

/**
 * Waar de data vandaan komt. Zolang Eric's endpoint nog niet draait staat dit
 * op 'mock'; daarna schakel je in de UI (of via VITE_API_URL) over op 'live'.
 */
export type SourceKind = 'mock' | 'live'

export const MOCK_URL = '/mock/rate-limits.json'

/** Het Laravel-endpoint, in te stellen via .env (zie .env.example). */
export const LIVE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/rate-limits'

export function sourceUrl(kind: SourceKind): string {
  return kind === 'mock' ? MOCK_URL : LIVE_URL
}

export async function fetchMeasurements(
  kind: SourceKind,
  signal?: AbortSignal,
): Promise<Measurement[]> {
  const url = sourceUrl(kind)

  let response: Response
  try {
    response = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new Error(
      kind === 'live'
        ? `Geen verbinding met ${url}. Draait de Laravel-server al?`
        : `Kon het mockup-bestand niet laden (${url}).`,
    )
  }

  if (!response.ok) {
    throw new Error(`${url} gaf HTTP ${response.status} ${response.statusText}.`)
  }

  return parseMeasurements(await response.json())
}
