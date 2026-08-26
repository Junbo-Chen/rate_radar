import type { Measurement, WindowKey } from '../api/contract'
import { windowLabel, WINDOW_KEYS } from '../api/contract'
import { useTimezone } from '../hooks/useTimezone'
import { formatNumber, formatTimeExact } from '../lib/format'
import { StatusBadge } from './StatusBadge'
import './AlertList.css'

export interface Alert {
  iso: string
  windowKey: WindowKey
  used: number
  limit: number
}

export function collectAlerts(measurements: Measurement[]): Alert[] {
  const alerts: Alert[] = []
  for (const measurement of measurements) {
    for (const key of WINDOW_KEYS) {
      const reading = measurement.limits[key]
      if (reading.hit_429) {
        alerts.push({
          iso: measurement.timestamp,
          windowKey: key,
          used: reading.used,
          limit: reading.limit,
        })
      }
    }
  }
  // Nieuwste bovenaan: dat is wat je als eerste wilt zien.
  return alerts.reverse()
}

export function AlertList({ alerts }: { alerts: Alert[] }) {
  const { mode } = useTimezone()

  return (
    <section className="alerts">
      <header className="alerts__head">
        <h2 className="alerts__title">Momenten met een 429</h2>
        {alerts.length > 0 && (
          <StatusBadge status="critical" size="sm" label={`${alerts.length} in beeld`} />
        )}
      </header>

      {alerts.length === 0 ? (
        <p className="alerts__empty">
          <StatusBadge status="ok" size="sm" label="Geen 429 in deze periode" />
        </p>
      ) : (
        <ol className="alerts__list">
          {alerts.map((alert) => (
            <li key={`${alert.iso}-${alert.windowKey}`} className="alerts__item">
              <span className="alerts__time">{formatTimeExact(alert.iso, mode)}</span>
              <span className="alerts__window">{windowLabel(alert.windowKey)}</span>
              <span className="alerts__counts">
                {formatNumber(alert.used)} / {formatNumber(alert.limit)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
