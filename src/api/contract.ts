/**
 * Het JSON-contract tussen de Laravel back-end (Eric) en dit dashboard (Junbo).
 * Zie API-CONTRACT.md voor de afspraak in tekstvorm.
 */

/** De drie limietvensters die Lightspeed hanteert. */
export const WINDOW_KEYS = ['5min', '1hour', '24hour'] as const

export type WindowKey = (typeof WINDOW_KEYS)[number]

/** Eén gemeten limiet binnen één venster. */
export interface LimitReading {
  /** Aantal verbruikte calls in dit venster op het moment van meten. */
  used: number
  /** Het maximum dat Lightspeed voor dit venster toestaat. */
  limit: number
  /** True als de call een HTTP 429 Too Many Requests opleverde. */
  hit_429: boolean
}

/** Eén meting: alle drie de vensters op één tijdstip. */
export interface Measurement {
  /** ISO-8601 in UTC, altijd op :04:55, :09:55, ... (5 seconden voor de reset). */
  timestamp: string
  limits: Record<WindowKey, LimitReading>
}

/**
 * De back-end mag de metingen kaal als array teruggeven,
 * of ingepakt in een envelop. De client accepteert beide vormen.
 */
export type MeasurementsResponse = Measurement[] | { data: Measurement[] }

const WINDOW_LABELS: Record<WindowKey, string> = {
  '5min': '5 minuten',
  '1hour': '1 uur',
  '24hour': '24 uur',
}

export function windowLabel(key: WindowKey): string {
  return WINDOW_LABELS[key]
}

function isLimitReading(value: unknown): value is LimitReading {
  if (typeof value !== 'object' || value === null) return false
  const reading = value as Record<string, unknown>
  return (
    typeof reading.used === 'number' &&
    typeof reading.limit === 'number' &&
    typeof reading.hit_429 === 'boolean'
  )
}

/**
 * Controleert of binnenkomende data het contract volgt. Zo merken we het
 * meteen wanneer Eric's endpoint een ander formaat teruggeeft, in plaats van
 * dat de grafiek stilletjes leeg blijft.
 */
/**
 * De vensternamen die Eric's Laravel-endpoint gebruikt, vertaald naar de onze.
 * Lightspeed noemt ze zo in zijn `accountRatelimit`-respons.
 */
const LARAVEL_WINDOWS: Record<string, WindowKey> = {
  limit5Min: '5min',
  limitHour: '1hour',
  limitDay: '24hour',
}

/**
 * Vertaalt één momentopname van `GET /api/account/ratelimit` naar een meting.
 *
 * Dat endpoint geeft de húidige stand terug, geen reeks: één object met
 * `limit5Min` / `limitHour` / `limitDay`. Levert het niet die drie vensters op,
 * dan geven we null terug en valt de aanroeper terug op de foutmelding.
 */
function adaptSnapshot(payload: unknown): Measurement | null {
  if (typeof payload !== 'object' || payload === null) return null

  const record = payload as Record<string, unknown>
  if (typeof record.timestamp !== 'string' || Number.isNaN(Date.parse(record.timestamp))) {
    return null
  }

  const limits = record.limits
  if (typeof limits !== 'object' || limits === null) return null

  const source = limits as Record<string, unknown>
  const mapped = {} as Record<WindowKey, LimitReading>

  for (const [from, to] of Object.entries(LARAVEL_WINDOWS)) {
    const reading = source[from]
    if (!isLimitReading(reading)) return null
    mapped[to] = { used: reading.used, limit: reading.limit, hit_429: reading.hit_429 }
  }

  return { timestamp: record.timestamp, limits: mapped }
}

export function parseMeasurements(payload: unknown): Measurement[] {
  const rows = Array.isArray(payload)
    ? payload
    : typeof payload === 'object' && payload !== null && Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : null

  if (rows === null) {
    // Geen reeks: misschien één momentopname van de Laravel-kant.
    const snapshot = adaptSnapshot(payload)
    if (snapshot) return [snapshot]

    throw new Error(
      'Onverwacht formaat: verwacht een array met metingen, { "data": [...] }, ' +
        'of één momentopname met limit5Min / limitHour / limitDay.',
    )
  }

  const parsed = rows.map((row, index) => {
    if (typeof row !== 'object' || row === null) {
      throw new Error(`Meting ${index} is geen object.`)
    }
    const record = row as Record<string, unknown>
    if (typeof record.timestamp !== 'string' || Number.isNaN(Date.parse(record.timestamp))) {
      throw new Error(`Meting ${index} mist een geldige timestamp.`)
    }
    const limits = record.limits as Record<string, unknown> | undefined
    if (typeof limits !== 'object' || limits === null) {
      throw new Error(`Meting ${index} mist het veld "limits".`)
    }
    for (const key of WINDOW_KEYS) {
      if (!isLimitReading(limits[key])) {
        throw new Error(`Meting ${index} mist een geldig venster "${key}" (used, limit, hit_429).`)
      }
    }
    return row as Measurement
  })

  // Oplopend op tijd, zodat de grafiek altijd van links naar rechts loopt,
  // ongeacht de volgorde die de back-end aanhoudt.
  return parsed.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
}
