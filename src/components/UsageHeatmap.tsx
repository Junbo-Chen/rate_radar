import { useMemo } from 'react'
import { windowLabel, type Measurement, type WindowKey } from '../api/contract'
import { useTimezone, type TimeZoneMode } from '../hooks/useTimezone'
import { dayKey, formatDayKey, formatNumber, formatPercent } from '../lib/format'
import { WARNING_THRESHOLD } from '../lib/status'
import './UsageHeatmap.css'

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

/** Piekstand binnen één uurvak. */
interface Block {
  ratio: number
  used: number
  limit: number
  hit429: boolean
}

/**
 * Zes niveaus, waarvan vier blauwtinten voor het normale bereik en twee
 * statuskleuren aan de top. Zo blijft de schaal rustig zolang er niets aan de
 * hand is, en springt hij eruit zodra het spannend wordt.
 */
type Level = 'empty' | 'l1' | 'l2' | 'l3' | 'warn' | 'crit'

const LEGEND: { level: Level; label: string }[] = [
  { level: 'empty', label: 'niet gemeten' },
  { level: 'l1', label: '0-20%' },
  { level: 'l2', label: '20-50%' },
  { level: 'l3', label: '50-80%' },
  { level: 'warn', label: '80-100%' },
  { level: 'crit', label: '429' },
]

function levelOf(block: Block | undefined): Level {
  if (!block) return 'empty'
  if (block.hit429 || block.ratio >= 1) return 'crit'
  if (block.ratio >= WARNING_THRESHOLD) return 'warn'
  if (block.ratio >= 0.5) return 'l3'
  if (block.ratio >= 0.2) return 'l2'
  return 'l1'
}

function hourOf(iso: string, mode: TimeZoneMode): number {
  const date = new Date(iso)
  return mode === 'utc' ? date.getUTCHours() : date.getHours()
}

/**
 * Per uurvak de hóógste stand, niet het gemiddelde.
 *
 * Deze tellers zijn rollend: middelen zou juist de pieken wegpoetsen waar dit
 * dashboard voor bestaat. Dezelfde keuze als in de uur- en daggrafieken.
 */
function buildGrid(
  measurements: Measurement[],
  key: WindowKey,
  mode: TimeZoneMode,
): Map<string, Map<number, Block>> {
  const grid = new Map<string, Map<number, Block>>()

  for (const measurement of measurements) {
    const reading = measurement.limits[key]
    const day = dayKey(measurement.timestamp, mode)
    const hour = hourOf(measurement.timestamp, mode)
    const ratio = reading.limit > 0 ? reading.used / reading.limit : 0

    let row = grid.get(day)
    if (!row) {
      row = new Map<number, Block>()
      grid.set(day, row)
    }

    const current = row.get(hour)

    row.set(hour, {
      ratio: Math.max(ratio, current?.ratio ?? 0),
      used: Math.max(reading.used, current?.used ?? 0),
      limit: reading.limit,
      // Eén 429 ergens in het uur blijft zichtbaar, ook als de rest rustig was.
      hit429: reading.hit_429 || (current?.hit429 ?? false),
    })
  }

  return grid
}

interface Props {
  measurements: Measurement[]
  windowKey: WindowKey
  /**
   * De dagen die als rij getoond worden, nieuwste eerst, als `2026-08-28`.
   *
   * Komt van buiten in plaats van uit de metingen zelf: zo staat de hoogte van
   * het blok vast en volgt hij dezelfde selectie als de grafieken. Een dag
   * zonder metingen krijgt gewoon een lege rij.
   */
  days: string[]
  /** Beschrijft het getoonde tijdvak, bijvoorbeeld "7 dagen t/m vr 28 aug". */
  spanLabel?: string
}

/**
 * Dagen tegen uren, met de piekbezetting als kleur. Laat in één oogopslag zien
 * wanneer op de dag je tegen de limiet aanloopt -- iets wat je in een doorlopende
 * lijn pas ziet als je er lang naar staart.
 */
export function UsageHeatmap({ measurements, windowKey, days, spanLabel }: Props) {
  const { mode } = useTimezone()

  const grid = useMemo(
    () => buildGrid(measurements, windowKey, mode),
    [measurements, windowKey, mode],
  )

  return (
    <section className="heatmap">
      <header className="heatmap__head">
        <h2 className="heatmap__title">Verbruik per uur</h2>
        <span className="heatmap__subtitle">
          piek per uurvak, {windowLabel(windowKey)}-venster
          {spanLabel && <> · {spanLabel}</>}
        </span>
      </header>

      {days.length === 0 ? (
        <p className="heatmap__empty">Nog geen metingen om te verdelen over de uren.</p>
      ) : (
        <div className="heatmap__scroll">
          <div className="heatmap__grid" role="table" aria-label="Verbruik per uur en dag">
            <div className="heatmap__row heatmap__row--header" role="row">
              <span className="heatmap__day-label" role="columnheader" />
              {HOURS.map((hour) => (
                <span key={hour} className="heatmap__hour-label" role="columnheader">
                  {/* Elk uur labelen wordt een muur van cijfers; om de drie is genoeg
                      om je te oriënteren. */}
                  {hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}
                </span>
              ))}
            </div>

            {days.map((day) => {
              const row = grid.get(day)

              return (
                <div key={day} className="heatmap__row" role="row">
                  <span className="heatmap__day-label" role="rowheader">
                    {formatDayKey(day, mode)}
                  </span>

                  {HOURS.map((hour) => {
                    const block = row?.get(hour)
                    const level = levelOf(block)
                    const clock = `${String(hour).padStart(2, '0')}:00`

                    return (
                      <span
                        key={hour}
                        className="heatmap__cell"
                        data-level={level}
                        role="cell"
                        title={
                          block
                            ? `${formatDayKey(day, mode)} ${clock} — piek ${formatNumber(
                                block.used,
                              )} van ${formatNumber(block.limit)} (${formatPercent(block.ratio)})${
                                block.hit429 ? ' — 429 geraakt' : ''
                              }`
                            : `${formatDayKey(day, mode)} ${clock} — niet gemeten`
                        }
                      >
                        {/* De ruit markeert een 429 ook zonder kleur te kunnen zien. */}
                        {block?.hit429 ? <span className="heatmap__marker" aria-hidden="true" /> : null}
                      </span>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <ul className="heatmap__legend">
        {LEGEND.map((entry) => (
          <li key={entry.level} className="heatmap__legend-item">
            <span className="heatmap__cell heatmap__cell--sample" data-level={entry.level} />
            {entry.label}
          </li>
        ))}
      </ul>
    </section>
  )
}
