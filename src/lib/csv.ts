import { WINDOW_KEYS, type Measurement } from '../api/contract'
import type { TimeZoneMode } from '../hooks/useTimezone'
import { formatDateTime } from './format'

/**
 * Metingen als CSV, om ze in Excel of een notebook verder te bekijken.
 *
 * Puntkomma als scheidingsteken: Excel in een Nederlandse Windows-installatie
 * splitst daarop en niet op de komma. Met een komma belandt elke regel in
 * één cel, wat er als een kapot bestand uitziet terwijl het dat niet is.
 */
const SEPARATOR = ';'

/**
 * Zet één waarde veilig in een veld. Nodig zodra er een puntkomma, een
 * aanhalingsteken of een regeleinde in zit -- bij ons vooral in de kolom met
 * de opgemaakte tijd, want die bevat spaties en punten.
 */
function cell(value: string | number | boolean): string {
  const text = typeof value === 'boolean' ? (value ? 'ja' : 'nee') : String(value)

  if (!/[";\r\n]/.test(text)) return text

  return `"${text.replace(/"/g, '""')}"`
}

export function toCsv(measurements: Measurement[], mode: TimeZoneMode): string {
  const header = [
    'tijdstip_utc',
    'tijdstip_weergegeven',
    ...WINDOW_KEYS.flatMap((key) => [
      `${key}_gebruikt`,
      `${key}_limiet`,
      `${key}_percentage`,
      `${key}_429`,
    ]),
  ]

  const rows = measurements.map((measurement) => [
    measurement.timestamp,
    formatDateTime(measurement.timestamp, mode),
    ...WINDOW_KEYS.flatMap((key) => {
      const reading = measurement.limits[key]
      // Percentage als geheel getal: een decimaal met punt wordt door een
      // Nederlandse Excel als tekst gelezen, en dan kun je er niet mee rekenen.
      const percentage = reading.limit > 0 ? Math.round((reading.used / reading.limit) * 100) : 0

      return [reading.used, reading.limit, percentage, reading.hit_429]
    }),
  ])

  return [header, ...rows].map((row) => row.map(cell).join(SEPARATOR)).join('\r\n')
}

/** `rateradar-2026-08-28.csv`, of met de webshop erbij als er één gekozen is. */
export function csvFilename(storeId: string): string {
  const today = new Date().toISOString().slice(0, 10)
  return storeId ? `rateradar-store-${storeId}-${today}.csv` : `rateradar-${today}.csv`
}

export function downloadCsv(filename: string, contents: string): void {
  // De BOM vooraan zorgt dat Excel het als UTF-8 opent. Zonder dit worden
  // accenten en het euroteken onleesbaar.
  const blob = new Blob([`\uFEFF${contents}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()

  // Pas vrijgeven nadat de browser het downloaden heeft opgepakt; direct
  // intrekken breekt de download in Safari af.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
