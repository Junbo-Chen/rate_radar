import { useMemo, useState } from 'react'
import { LIVE_URL, MOCK_URL, type SourceKind } from '../api/client'
import { WINDOW_KEYS, type Measurement, type WindowKey } from '../api/contract'
import { AlertList, collectAlerts } from '../components/AlertList'
import { DataTable } from '../components/DataTable'
import { LimitChart, type ChartPoint } from '../components/LimitChart'
import { LimitTile } from '../components/LimitTile'
import { StatusBadge } from '../components/StatusBadge'
import { RANGES, Toolbar, type RangeId } from '../components/Toolbar'
import { useRateLimits } from '../hooks/useRateLimits'
import { useTimezone, type TimeZoneMode } from '../hooks/useTimezone'
import { formatRelative, formatTimeExact, zoneCaption } from '../lib/format'
import { statusOf, worstStatus } from '../lib/status'

const POLL_INTERVAL_MS = 60_000
const PRIMARY_WINDOW: WindowKey = '5min'
const SECONDARY_WINDOWS = WINDOW_KEYS.filter((key) => key !== PRIMARY_WINDOW)

export type BucketSize = 'hour' | 'day'

/**
 * Hoeveel geschiedenis elk venster toont. Een limiet over 24 uur zegt weinig in
 * een grafiek van drie uur, dus hoe langer het venster, hoe verder we terugkijken.
 * Het 5-minutenvenster volgt de filterrij; deze twee staan vast.
 */
const LOOKBACK: Partial<
  Record<WindowKey, { minutes: number; label: string; bucket: BucketSize }>
> = {
  '1hour': { minutes: 24 * 60, label: 'laatste 24 uur, per uur', bucket: 'hour' },
  '24hour': { minutes: 7 * 24 * 60, label: 'laatste 7 dagen, per dag', bucket: 'day' },
}

/** Metingen vanaf `minutes` vóór de laatste meting. Ankert op de data en niet
 *  op de wandklok, zodat een haperende back-end geen lege grafiek oplevert. */
function lastMinutes(measurements: Measurement[], minutes: number): Measurement[] {
  const last = measurements.at(-1)
  if (!last) return measurements

  const cutoff = Date.parse(last.timestamp) - minutes * 60_000
  return measurements.filter((measurement) => Date.parse(measurement.timestamp) >= cutoff)
}

function withinRange(measurements: Measurement[], range: RangeId): Measurement[] {
  const preset = RANGES.find((candidate) => candidate.id === range)
  if (!preset || !('minutes' in preset)) return measurements

  return lastMinutes(measurements, preset.minutes)
}

/** Begin van het uur of de dag waar dit tijdstip in valt, in de getoonde zone. */
function bucketStart(ms: number, bucket: BucketSize, mode: TimeZoneMode): number {
  const date = new Date(ms)

  if (mode === 'utc') {
    const parts = [date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()] as const
    return bucket === 'hour' ? Date.UTC(...parts, date.getUTCHours()) : Date.UTC(...parts)
  }

  const parts = [date.getFullYear(), date.getMonth(), date.getDate()] as const
  return bucket === 'hour'
    ? new Date(...parts, date.getHours()).getTime()
    : new Date(...parts).getTime()
}

/**
 * Vat de 5-minuten-metingen samen tot één punt per uur of per dag.
 *
 * Per bucket houden we de hóógste stand aan. Deze tellers zijn rollend: de
 * uurteller zegt "zoveel calls in de afgelopen 60 minuten". Het maximum vertelt
 * dus hoe dicht je dat uur bij de limiet kwam — precies waar dit dashboard voor
 * bestaat. Middelen zou die pieken wegpoetsen. Een 429 ergens in de bucket
 * blijft altijd zichtbaar.
 */
function aggregate(points: ChartPoint[], bucket: BucketSize, mode: TimeZoneMode): ChartPoint[] {
  const groups = new Map<number, ChartPoint[]>()

  for (const point of points) {
    const key = bucketStart(point.t, bucket, mode)
    const group = groups.get(key)
    if (group) group.push(point)
    else groups.set(key, [point])
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([key, group]) => {
      const peak = group.reduce((highest, point) => (point.used > highest.used ? point : highest))
      return {
        ...peak,
        t: key,
        iso: new Date(key).toISOString(),
        hit429: group.some((point) => point.hit429),
      }
    })
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

const FIVE_MIN_MS = 5 * 60 * 1000

/**
 * Vult de volle terugblik met 5-minuten-slots en zet elk slot waarvoor geen
 * meting bestaat op 0. Zonder dit krimpt de as tot de paar uur die de mockup
 * bevat en toont een "laatste 7 dagen"-grafiek in werkelijkheid een halve dag.
 *
 * Let op bij het lezen: een 0 betekent hier "niet gemeten", niet "nul calls".
 * Zodra de back-end echte historie levert vullen die slots zich vanzelf.
 */
function paddedChartPoints(
  measurements: Measurement[],
  key: WindowKey,
  minutes: number,
): ChartPoint[] {
  const last = measurements.at(-1)
  if (!last) return []

  const end = Date.parse(last.timestamp)
  const start = end - minutes * 60_000
  const limit = last.limits[key].limit

  const bySlot = new Map(
    measurements.map((measurement) => [Date.parse(measurement.timestamp), measurement]),
  )

  const points: ChartPoint[] = []
  for (let slot = start; slot <= end; slot += FIVE_MIN_MS) {
    const measurement = bySlot.get(slot)
    const reading = measurement?.limits[key]

    points.push({
      t: slot,
      iso: new Date(slot).toISOString(),
      used: reading?.used ?? 0,
      limit: reading?.limit ?? limit,
      ratio: reading && reading.limit > 0 ? reading.used / reading.limit : 0,
      hit429: reading?.hit_429 ?? false,
    })
  }

  return points
}

interface Props {
  source: SourceKind
  onSourceChange: (source: SourceKind) => void
}

export function DashboardPage({ source, onSourceChange }: Props) {
  const [range, setRange] = useState<RangeId>('all')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const { mode: zone } = useTimezone()

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
    for (const key of WINDOW_KEYS) {
      const lookback = LOOKBACK[key]
      // Zonder eigen terugblik volgt het venster de filterrij bovenaan.
      points[key] = lookback
        ? aggregate(paddedChartPoints(measurements, key, lookback.minutes), lookback.bucket, zone)
        : toChartPoints(visible, key)
    }
    return points
  }, [visible, measurements, zone])

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
    <>
      <Toolbar
        source={source}
        onSourceChange={onSourceChange}
        range={range}
        onRangeChange={setRange}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        onRefresh={refresh}
        isRefreshing={isRefreshing}
      />

      <p className="app__meta">
        {overallStatus && (
          <>
            <StatusBadge status={overallStatus} size="sm" />
            {' · '}
          </>
        )}
        Bron: <code>{source === 'mock' ? MOCK_URL : LIVE_URL}</code>
        {latest && (
          <>
            {' '}
            · laatste meting {formatTimeExact(latest.timestamp, zone)}
            {zone === 'utc' ? ' UTC' : ''}
            {/* De ouderdom staat erbij zodat je niet zelf van UTC naar je eigen
                klok hoeft te rekenen om te zien of het dashboard bijloopt. */}{' '}
            ({formatRelative(latest.timestamp)})
          </>
        )}
        {lastUpdated && <> · opgehaald {formatRelative(new Date(lastUpdated).toISOString())}</>}
        {' · '}
        {zoneCaption(zone)}
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
              <LimitChart
                key={key}
                windowKey={key}
                points={chartPoints[key]}
                variant="compact"
                spanLabel={LOOKBACK[key]?.label}
                bucket={LOOKBACK[key]?.bucket}
              />
            ))}
          </section>

          <DataTable measurements={visible} />
        </div>
      )}
    </>
  )
}
