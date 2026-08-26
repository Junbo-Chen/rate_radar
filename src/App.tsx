import { useMemo, useState } from 'react'
import { LIVE_URL, MOCK_URL, type SourceKind } from './api/client'
import { WINDOW_KEYS, type Measurement, type WindowKey } from './api/contract'
import { AlertList, collectAlerts } from './components/AlertList'
import { DataTable } from './components/DataTable'
import { LimitChart, type ChartPoint } from './components/LimitChart'
import { LimitTile } from './components/LimitTile'
import { RANGES, Toolbar, type RangeId } from './components/Toolbar'
import { useRateLimits } from './hooks/useRateLimits'
import { useTheme } from './hooks/useTheme'
import { formatRelative, formatTimeExact } from './lib/format'
import { statusOf, worstStatus } from './lib/status'
import { StatusBadge } from './components/StatusBadge'
import './App.css'

const POLL_INTERVAL_MS = 60_000

/** De 5-minutenlimiet is de kritieke; die staat groot, de rest is context. */
const PRIMARY_WINDOW: WindowKey = '5min'
const SECONDARY_WINDOWS = WINDOW_KEYS.filter((key) => key !== PRIMARY_WINDOW)

/**
 * Filtert op een periode die relatief is aan de laatste meting. De mockup
 * beslaat een vast venster in het verleden; afzetten tegen de wandklok zou
 * "laatste uur" altijd leeg maken.
 */
function withinRange(measurements: Measurement[], range: RangeId): Measurement[] {
  const preset = RANGES.find((candidate) => candidate.id === range)
  if (!preset || !('minutes' in preset)) return measurements

  const last = measurements.at(-1)
  if (!last) return measurements

  const cutoff = Date.parse(last.timestamp) - preset.minutes * 60_000
  return measurements.filter((measurement) => Date.parse(measurement.timestamp) >= cutoff)
}

function toChartPoints(measurements: Measurement[], key: WindowKey): ChartPoint[] {
  return measurements.map((measurement) => {
    const reading = measurement.limits[key]
    return {
      t: Date.parse(measurement.timestamp),
      iso: measurement.timestamp,
      used: reading.used,
      limit: reading.limit,
      ratio: reading.limit > 0 ? reading.used / reading.limit : 0,
      hit429: reading.hit_429,
    }
  })
}

export default function App() {
  const [source, setSource] = useState<SourceKind>('mock')
  const [range, setRange] = useState<RangeId>('all')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const { theme, cycle: cycleTheme } = useTheme()

  const { measurements, isInitialLoading, isRefreshing, error, lastUpdated, refresh } =
    useRateLimits({
      source,
      pollInterval: autoRefresh ? POLL_INTERVAL_MS : null,
    })

  const visible = useMemo(() => withinRange(measurements, range), [measurements, range])
  const latest = visible.at(-1)
  const alerts = useMemo(() => collectAlerts(visible), [visible])

  const chartPoints = useMemo(() => {
    const points = {} as Record<WindowKey, ChartPoint[]>
    for (const key of WINDOW_KEYS) points[key] = toChartPoints(visible, key)
    return points
  }, [visible])

  const hitCounts = useMemo(() => {
    const counts = { '5min': 0, '1hour': 0, '24hour': 0 } as Record<WindowKey, number>
    for (const measurement of visible) {
      for (const key of WINDOW_KEYS) {
        if (measurement.limits[key].hit_429) counts[key] += 1
      }
    }
    return counts
  }, [visible])

  const overallStatus = latest
    ? worstStatus(WINDOW_KEYS.map((key) => statusOf(latest.limits[key])))
    : null

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1 className="app__title">RateRadar</h1>
          <p className="app__tagline">
            API-limieten per Lightspeed-webshop, met de nadruk op het 5-minutenvenster.
          </p>
        </div>

        <div className="app__header-side">
          {overallStatus && <StatusBadge status={overallStatus} />}
          <button
            type="button"
            className="button"
            onClick={cycleTheme}
            aria-label={`Thema: ${theme}. Klik om te wisselen.`}
          >
            {theme === 'system' ? 'Systeem' : theme === 'light' ? 'Licht' : 'Donker'}
          </button>
        </div>
      </header>

      <Toolbar
        source={source}
        onSourceChange={setSource}
        range={range}
        onRangeChange={setRange}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        onRefresh={refresh}
        isRefreshing={isRefreshing}
      />

      <p className="app__meta">
        Bron: <code>{source === 'mock' ? MOCK_URL : LIVE_URL}</code>
        {latest && <> · laatste meting {formatTimeExact(latest.timestamp)}</>}
        {lastUpdated && <> · opgehaald {formatRelative(new Date(lastUpdated).toISOString())}</>}
      </p>

      {error && (
        <div className="app__error" role="alert">
          <StatusBadge status="critical" size="sm" label="Ophalen mislukt" />
          <p>{error}</p>
          {source === 'live' && (
            <p className="app__error-hint">
              Stel het endpoint in via <code>VITE_API_URL</code> in <code>.env</code>, of schakel
              terug naar de mockup zolang de back-end nog niet draait.
            </p>
          )}
        </div>
      )}

      {isInitialLoading ? (
        <p className="app__placeholder">Metingen laden…</p>
      ) : !latest ? (
        <p className="app__placeholder">Geen metingen in deze periode.</p>
      ) : (
        /* Tijdens een achtergrondverversing dimmen we, in plaats van de
           inhoud te vervangen door een skelet — dat zou de pagina laten springen. */
        <div className="app__content" data-refreshing={isRefreshing || undefined}>
          <section className="app__kpis">
            <LimitTile
              windowKey={PRIMARY_WINDOW}
              reading={latest.limits[PRIMARY_WINDOW]}
              variant="hero"
              hitCount={hitCounts[PRIMARY_WINDOW]}
            />
            {SECONDARY_WINDOWS.map((key) => (
              <LimitTile
                key={key}
                windowKey={key}
                reading={latest.limits[key]}
                hitCount={hitCounts[key]}
              />
            ))}
          </section>

          <section className="app__main">
            <LimitChart windowKey={PRIMARY_WINDOW} points={chartPoints[PRIMARY_WINDOW]} />
            <AlertList alerts={alerts} />
          </section>

          <section className="app__secondary">
            {SECONDARY_WINDOWS.map((key) => (
              <LimitChart key={key} windowKey={key} points={chartPoints[key]} variant="compact" />
            ))}
          </section>

          <DataTable measurements={visible} />
        </div>
      )}
    </div>
  )
}
