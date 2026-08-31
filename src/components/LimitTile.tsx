import type { LimitReading, WindowKey } from '../api/contract'
import { windowLabel } from '../api/contract'
import { useTimezone } from '../hooks/useTimezone'
import { formatNumber, formatPercent, formatTime } from '../lib/format'
import type { Projection } from '../lib/projection'
import { statusOf, usageRatio, WARNING_THRESHOLD } from '../lib/status'
import { StatusBadge } from './StatusBadge'
import './LimitTile.css'

interface Props {
  windowKey: WindowKey
  reading: LimitReading
  /** De 5-minutenlimiet is de kritieke; die krijgt het grote kengetal. */
  variant?: 'hero' | 'tile'
  /** Aantal 429's in de getoonde periode, voor de regel onder de meter. */
  hitCount?: number
  /** Wanneer dit venster vol raakt op het huidige tempo; null = geen zicht op. */
  projection?: Projection | null
}

/** "3 min" of "1 u 20 min": onder het uur is een preciezer getal niet nuttig. */
function formatDuration(minutes: number): string {
  const total = Math.max(1, Math.round(minutes))
  if (total < 60) return `${total} min`

  const hours = Math.floor(total / 60)
  const rest = total % 60
  return rest === 0 ? `${hours} u` : `${hours} u ${rest} min`
}

export function LimitTile({
  windowKey,
  reading,
  variant = 'tile',
  hitCount = 0,
  projection = null,
}: Props) {
  const { mode } = useTimezone()
  const ratio = usageRatio(reading)
  const status = statusOf(reading)
  const fillPercent = Math.min(100, ratio * 100)

  return (
    <article className={`tile tile--${variant} tile--${status}`}>
      <header className="tile__head">
        <h3 className="tile__label">{windowLabel(windowKey)}</h3>
        <StatusBadge status={status} size={variant === 'hero' ? 'md' : 'sm'} />
      </header>

      <p className="tile__value">
        {formatPercent(ratio)}
        <span className="tile__unit">verbruikt</span>
      </p>

      <div
        className="tile__meter"
        role="meter"
        aria-valuenow={reading.used}
        aria-valuemin={0}
        aria-valuemax={reading.limit}
        aria-label={`${windowLabel(windowKey)}: ${reading.used} van ${reading.limit} calls`}
      >
        <div className="tile__meter-fill" style={{ inlineSize: `${fillPercent}%` }} />
        {/* Vaste markering op 80%: de grens waarboven de indicator oranje wordt. */}
        <span className="tile__meter-mark" style={{ insetInlineStart: `${WARNING_THRESHOLD * 100}%` }} />
      </div>

      <p className="tile__counts">
        <strong>{formatNumber(reading.used)}</strong> van {formatNumber(reading.limit)} calls
      </p>

      {/* Vooruitkijken is het punt van een radar: niet dat je 40% verbruikt
          hebt, maar wanneer je erdoorheen gaat als het zo doorgaat. */}
      {projection && (
        <p className="tile__projection">
          Op dit tempo vol om <strong>{formatTime(projection.at, mode)}</strong> — over{' '}
          {formatDuration(projection.minutesLeft)}
        </p>
      )}

      {hitCount > 0 && (
        <p className="tile__hits">
          {hitCount}× een 429 in deze periode
        </p>
      )}
    </article>
  )
}
