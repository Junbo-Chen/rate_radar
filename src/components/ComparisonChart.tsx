import { useMemo } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { windowLabel, type Measurement, type WindowKey } from '../api/contract'
import { useTimezone } from '../hooks/useTimezone'
import { formatNumber, formatTime } from '../lib/format'
import './ComparisonChart.css'

/**
 * Kleuren per webshop. Zes is genoeg: daarboven wordt een lijngrafiek toch
 * onleesbaar, en dan is een tabel de betere weergave.
 */
const SERIES_COLORS = ['#2563eb', '#ea580c', '#16a34a', '#9333ea', '#0891b2', '#ca8a04']

interface Props {
  byStore: Record<string, Measurement[]>
  windowKey: WindowKey
  isLoading: boolean
  failures: Record<string, string>
}

/** Eén rij per tijdstip, met per webshop een kolom. Dat is wat recharts wil. */
function toRows(byStore: Record<string, Measurement[]>, key: WindowKey) {
  const byTime = new Map<number, Record<string, number>>()

  for (const [storeId, measurements] of Object.entries(byStore)) {
    for (const measurement of measurements) {
      const at = Date.parse(measurement.timestamp)
      const row = byTime.get(at) ?? {}
      row[storeId] = measurement.limits[key].used
      byTime.set(at, row)
    }
  }

  return [...byTime.entries()]
    .sort(([a], [b]) => a - b)
    .map(([at, values]) => ({ t: at, ...values }))
}

/**
 * Wie van je webshops vreet het limiet op?
 *
 * Toont het verbruik, niet het percentage: webshops delen hetzelfde account en
 * dus dezelfde limiet, dus absolute calls zijn hier direct vergelijkbaar en
 * tellen op tot wat je account verbruikt.
 */
export function ComparisonChart({ byStore, windowKey, isLoading, failures }: Props) {
  const { mode } = useTimezone()
  const stores = useMemo(() => Object.keys(byStore).sort(), [byStore])
  const rows = useMemo(() => toRows(byStore, windowKey), [byStore, windowKey])

  const totals = useMemo(() => {
    const sums: Record<string, number> = {}
    for (const [storeId, measurements] of Object.entries(byStore)) {
      sums[storeId] = measurements.reduce(
        (highest, measurement) => Math.max(highest, measurement.limits[windowKey].used),
        0,
      )
    }
    return sums
  }, [byStore, windowKey])

  return (
    <section className="comparison">
      <header className="comparison__head">
        <h2 className="comparison__title">Webshops vergeleken</h2>
        <span className="comparison__subtitle">
          verbruik per {windowLabel(windowKey)}-venster, laatste 24 uur
        </span>
      </header>

      {Object.entries(failures).map(([storeId, message]) => (
        <p key={storeId} className="comparison__failure" role="alert">
          <strong>Store {storeId}</strong>: {message}
        </p>
      ))}

      {isLoading ? (
        <p className="comparison__empty">Metingen laden…</p>
      ) : rows.length === 0 ? (
        <p className="comparison__empty">
          Nog geen metingen om te vergelijken. Zodra de scheduler voor deze webshops meet, vullen
          de lijnen zich.
        </p>
      ) : (
        <>
          <div className="comparison__chart">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  scale="time"
                  tickFormatter={(value: number) => formatTime(new Date(value).toISOString(), mode)}
                  stroke="var(--axis)"
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                />
                <YAxis
                  stroke="var(--axis)"
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  width={44}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                  }}
                  labelFormatter={(value) => formatTime(new Date(Number(value)).toISOString(), mode)}
                  formatter={(value, name) => [formatNumber(Number(value ?? 0)), `Store ${name}`]}
                />
                <Legend
                  formatter={(value: string) => `Store ${value}`}
                  wrapperStyle={{ fontSize: 12 }}
                />
                {stores.map((storeId, index) => (
                  <Line
                    key={storeId}
                    type="monotone"
                    dataKey={storeId}
                    stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    /* Gaten overbruggen: een webshop die even niet gemeten is,
                       heeft geen nul calls gedaan. */
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <ol className="comparison__ranking">
            {stores
              .slice()
              .sort((a, b) => (totals[b] ?? 0) - (totals[a] ?? 0))
              .map((storeId, index) => (
                <li key={storeId} className="comparison__rank">
                  <span
                    className="comparison__swatch"
                    style={{
                      background: SERIES_COLORS[stores.indexOf(storeId) % SERIES_COLORS.length],
                    }}
                    aria-hidden="true"
                  />
                  <span className="comparison__store">Store {storeId}</span>
                  <span className="comparison__peak">
                    piek {formatNumber(totals[storeId] ?? 0)}
                    {index === 0 && stores.length > 1 && (
                      <span className="comparison__leader"> · hoogste</span>
                    )}
                  </span>
                </li>
              ))}
          </ol>
        </>
      )}
    </section>
  )
}
