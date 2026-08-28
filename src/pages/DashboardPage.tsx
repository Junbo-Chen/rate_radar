import { useEffect, useMemo, useRef, useState } from 'react'
import { LIVE_URL } from '../api/client'
import { windowLabel, WINDOW_KEYS, type Measurement, type WindowKey } from '../api/contract'
import { AlertList, collectAlerts } from '../components/AlertList'
import { DataTable } from '../components/DataTable'
import { LimitChart, type ChartPoint } from '../components/LimitChart'
import { LimitTile } from '../components/LimitTile'
import { StatusBadge } from '../components/StatusBadge'
import { ToastStack } from '../components/ToastStack'
import { RANGES, Toolbar, type RangeId } from '../components/Toolbar'
import { useToasts } from '../hooks/useToasts'
import { useCredentials } from '../hooks/useCredentials'
import { useRateLimits } from '../hooks/useRateLimits'
import { useTimezone, type TimeZoneMode } from '../hooks/useTimezone'
import { formatNumber, formatRelative, formatTimeExact, zoneCaption } from '../lib/format'
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
 * meting bestaat op 0. Zonder dit krimpt de as tot wat er tot nu toe opgehaald is
 * de app tot nu toe heeft opgehaald, en toont een "laatste 7 dagen"-grafiek
 * in werkelijkheid een paar minuten.
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

export function DashboardPage() {
  const [range, setRange] = useState<RangeId>('all')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [storeId, setStoreId] = useState('')
  const { mode: zone } = useTimezone()

  // De keuzelijst komt uit de opgeslagen credentials: dat zijn precies de
  // webshops waarvoor de back-end limieten kán ophalen.
  const { items: credentials } = useCredentials()
  const stores = useMemo(
    () => [...new Set(credentials.map((row) => row.store_id))].sort(),
    [credentials],
  )

  const { measurements, isInitialLoading, isRefreshing, error, lastUpdated, refresh } =
    useRateLimits({
      pollInterval: autoRefresh ? POLL_INTERVAL_MS : null,
      storeId,
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

  const { toasts, push, dismiss } = useToasts()

  /**
   * Meldt alleen 429's die er de vorige keer nog niet waren.
   *
   * Twee valkuilen die dit vermijdt. Bij de eerste lading staan er al 429's in
   * de reeks; die zijn niet nieuw, dus daar ijken we alleen op. En wisselt de
   * selectie (bron, webshop, periode), dan verandert de hele lijst in één keer —
   * ook dat is geen nieuws, dus dan ijken we opnieuw in plaats van te melden.
   */
  const selectionKey = `${storeId}|${range}`
  const seen = useRef<{ key: string; ids: Set<string> } | null>(null)

  useEffect(() => {
    // Nog niets binnen: hier valt niets te ijken en niets te melden.
    if (isInitialLoading) return

    const idOf = (alert: { iso: string; windowKey: WindowKey }) =>
      `${alert.iso}|${alert.windowKey}`

    const previous = seen.current
    const isNewSelection = !previous || previous.key !== selectionKey

    // Wacht met de eerste ijking tot er echt metingen zijn. Ijken op een lege
    // lijst maakt van elke bestaande 429 "nieuws" zodra de fetch binnenkomt —
    // precies wat er gebeurde bij het terugkeren van een andere pagina.
    if (isNewSelection && measurements.length === 0) return

    const ids = new Set(alerts.map(idOf))
    seen.current = { key: selectionKey, ids }

    if (isNewSelection) return

    for (const alert of alerts.filter((candidate) => !previous!.ids.has(idOf(candidate)))) {
      push({
        status: 'critical',
        title: `${windowLabel(alert.windowKey)}-limiet geraakt`,
        body: `${storeId ? `Store ${storeId}` : 'Webshop'} kreeg een 429 om ${formatTimeExact(
          alert.iso,
          zone,
        )} — ${formatNumber(alert.used)} van ${formatNumber(alert.limit)} calls.`,
      })
    }
  }, [alerts, selectionKey, push, storeId, zone, isInitialLoading, measurements.length])

  return (
    <>
      <Toolbar
        range={range}
        onRangeChange={setRange}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        onRefresh={refresh}
        isRefreshing={isRefreshing}
        stores={stores}
        storeId={storeId}
        onStoreChange={setStoreId}
      />

      <p className="app__meta">
        {overallStatus && (
          <>
            <StatusBadge status={overallStatus} size="sm" />
            {' · '}
          </>
        )}
        Bron: <code>{LIVE_URL}</code>
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
          <p className="app__error-hint">
            Draait <code>php artisan serve</code>? Het endpoint is instelbaar via{' '}
            <code>VITE_API_URL</code> in <code>.env</code>.
          </p>
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

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  )
}
