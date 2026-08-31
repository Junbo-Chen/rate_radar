import type { Measurement, WindowKey } from '../api/contract'

/**
 * Hoe lang elk venster duurt. Tegelijk de horizon waarbinnen een voorspelling
 * zin heeft: loopt de teller pas ná die tijd vol, dan is het venster allang
 * gereset en gebeurt het dus niet.
 */
const WINDOW_MINUTES: Record<WindowKey, number> = {
  '5min': 5,
  '1hour': 60,
  '24hour': 24 * 60,
}

/** Zoveel recente metingen wegen mee in het tempo. */
const SAMPLE_SIZE = 6

/**
 * Ouder dan dit en we zeggen niets: "op dit tempo" slaat nergens op wanneer het
 * tempo van gisteren is.
 */
const MAX_AGE_MINUTES = 15

export interface Projection {
  /** Calls per minuut over de recente metingen. */
  rate: number
  /** Minuten tot de limiet bereikt is. */
  minutesLeft: number
  /** Het verwachte moment, als ISO-tijdstempel. */
  at: string
}

/**
 * Wanneer loopt dit venster vol als het huidige tempo aanhoudt?
 *
 * Het tempo komt uit de stijgingen van de teller tussen opeenvolgende metingen.
 * Dalingen tellen niet mee: die betekenen dat het venster is gereset, niet dat
 * er calls zijn teruggegeven.
 *
 * Geeft null zodra een uitspraak niet eerlijk zou zijn: te weinig metingen, te
 * oude metingen, een teller die niet stijgt, of een moment dat voorbij de reset
 * van het venster ligt.
 */
export function projectLimit(
  measurements: Measurement[],
  key: WindowKey,
  now: number = Date.now(),
): Projection | null {
  const recent = measurements.slice(-SAMPLE_SIZE)
  if (recent.length < 2) return null

  const last = recent[recent.length - 1]
  const lastAt = Date.parse(last.timestamp)

  if (now - lastAt > MAX_AGE_MINUTES * 60_000) return null

  const reading = last.limits[key]
  const remaining = reading.limit - reading.used
  if (remaining <= 0) return null

  // Alleen de stijgingen: een lagere stand hoort bij een nieuw venster.
  let calls = 0
  let minutes = 0

  for (let index = 1; index < recent.length; index++) {
    const from = recent[index - 1]
    const to = recent[index]
    const step = (Date.parse(to.timestamp) - Date.parse(from.timestamp)) / 60_000
    if (step <= 0) continue

    const growth = to.limits[key].used - from.limits[key].used
    if (growth <= 0) continue

    calls += growth
    minutes += step
  }

  if (calls <= 0 || minutes <= 0) return null

  const rate = calls / minutes
  const minutesLeft = remaining / rate

  // Verder weg dan het venster lang is: dan reset hij eerder dan hij vol raakt.
  if (minutesLeft > WINDOW_MINUTES[key]) return null

  return {
    rate,
    minutesLeft,
    at: new Date(lastAt + minutesLeft * 60_000).toISOString(),
  }
}
