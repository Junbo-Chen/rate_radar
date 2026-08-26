import type { Measurement } from '../api/contract'
import { windowLabel, WINDOW_KEYS } from '../api/contract'
import { formatDateTime, formatNumber, formatPercent } from '../lib/format'
import { statusOf, STATUS_LABELS, usageRatio } from '../lib/status'
import './DataTable.css'

/**
 * De tabelweergave naast de grafieken. Elke waarde die de grafiek met kleur
 * toont staat hier ook als tekst, zodat niets alleen via kleur afleesbaar is.
 */
export function DataTable({ measurements }: { measurements: Measurement[] }) {
  // Nieuwste bovenaan, net als de meldingenlijst.
  const rows = [...measurements].reverse()

  return (
    <details className="table-view">
      <summary className="table-view__summary">
        Tabelweergave ({formatNumber(measurements.length)} metingen)
      </summary>

      <div className="table-view__scroll">
        <table className="table-view__table">
          <thead>
            <tr>
              <th scope="col">Tijdstip</th>
              {WINDOW_KEYS.map((key) => (
                <th key={key} scope="col" colSpan={2}>
                  {windowLabel(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((measurement) => (
              <tr key={measurement.timestamp}>
                <th scope="row">{formatDateTime(measurement.timestamp)}</th>
                {WINDOW_KEYS.map((key) => {
                  const reading = measurement.limits[key]
                  return [
                    <td key={`${key}-used`} className="table-view__num">
                      {formatNumber(reading.used)} / {formatNumber(reading.limit)}
                      <span className="table-view__pct"> ({formatPercent(usageRatio(reading))})</span>
                    </td>,
                    <td key={`${key}-status`}>{STATUS_LABELS[statusOf(reading)]}</td>,
                  ]
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
