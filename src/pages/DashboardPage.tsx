import { useEffect, useMemo, useRef, useState } from 'react'
import { LIVE_URL } from '../api/client'
import { windowLabel, WINDOW_KEYS, type Measurement, type WindowKey } from '../api/contract'
import { AlertList, collectAlerts } from '../components/AlertList'
import { DataTable } from '../components/DataTable'
import { ExportDialog } from '../components/ExportDialog'
import { LimitChart, type ChartPoint } from '../components/LimitChart'
import { LimitTile } from '../components/LimitTile'
import { StatusBadge } from '../components/StatusBadge'
import { ToastStack } from '../components/ToastStack'
import { RANGES, Toolbar, type RangeId } from '../components/Toolbar'
import { ComparisonChart } from '../components/ComparisonChart'
import { UsageHeatmap } from '../components/UsageHeatmap'
import { useToasts } from '../hooks/useToasts'
import { useComparison } from '../hooks/useComparison'
import { useCredentials } from '../hooks/useCredentials'
import { useNotifications } from '../hooks/useNotifications'
import { useRateLimits } from '../hooks/useRateLimits'
import { useTimezone, type TimeZoneMode } from '../hooks/useTimezone'
import {
  dayKey,
  formatDayKey,
  formatNumber,
  formatRelative,
  formatTimeExact,
  zoneCaption,
} from '../lib/format'
import { projectLimit } from '../lib/projection'
import { statusOf, worstStatus } from '../lib/status'

const POLL_INTERVAL_MS = 60_000
const PRIMARY_WINDOW: WindowKey = '5min'

/** Hoogte van de heatmap. Vast, zodat het blok niet meegroeit met de data. */
const HEATMAP_DAYS = 7
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

/** Alle metingen van één kalenderdag: middernacht tot middernacht. */
function onDay(measurements: Measurement[], day: string, mode: TimeZoneMode): Measurement[] {
  return measurements.filter((measurement) => dayKey(measurement.timestamp, mode) === day)
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

/** Het tijdvak dat een grafiek beslaat. */
interface Span {
  start: number
  end: number
}

/**
 * Alle bucketstarts binnen een tijdvak, in de getoonde zone.
 *
 * Stapt niet blind met 24 uur door: op een dag waarop de klok verspringt duurt
 * die 23 of 25 uur. Elke stap wordt daarom opnieuw op het bucketbegin gezet.
 */
function bucketStarts(span: Span, bucket: BucketSize, mode: TimeZoneMode): number[] {
  const step = bucket === 'hour' ? 60 * 60_000 : 24 * 60 * 60_000
  const overshoot = bucket === 'day' ? 60 * 60_000 : 0
  const last = bucketStart(span.end, bucket, mode)

  const starts: number[] = []
  let cursor = bucketStart(span.start, bucket, mode)

  while (cursor <= last) {
    starts.push(cursor)
    cursor = bucketStart(cursor + step + overshoot, bucket, mode)
  }

  return starts
}

/**
 * De punten voor een samengevatte grafiek: per uur of per dag de hoogste stand
 * binnen dat tijdvak, met lege buckets erbij zodat de as het volle tijdvak
 * beslaat in plaats van alleen wat er toevallig gemeten is.
 *
 * Let op bij het lezen: een 0 betekent hier "niet gemeten", niet "nul calls".
 *
 * Er werd eerder een raster van 5-minuten-slots opgevuld en daarna samengevat.
 * Dat verloor metingen: de back-end meet niet op de seconde nauwkeurig, dus een
 * meting van 14:59:56 viel naast elk slot en telde niet mee.
 */
function bucketedPoints(
  measurements: Measurement[],
  key: WindowKey,
  span: Span,
  bucket: BucketSize,
  mode: TimeZoneMode,
): ChartPoint[] {
  const inSpan = measurements.filter((measurement) => {
    const at = Date.parse(measurement.timestamp)
    return at >= span.start && at <= span.end
  })

  const byBucket = new Map(
    aggregate(toChartPoints(inSpan, key), bucket, mode).map((point) => [point.t, point]),
  )

  // De limiet van de laatste meting geldt ook voor de lege buckets: anders zakt
  // de limietlijn naar nul zodra er een gat in de reeks zit.
  const limit = measurements.at(-1)?.limits[key].limit ?? 0

  return bucketStarts(span, bucket, mode).map(
    (at) =>
      byBucket.get(at) ?? {
        t: at,
        iso: new Date(at).toISOString(),
        used: 0,
        limit,
        ratio: 0,
        hit429: false,
      },
  )
}

/** Laatste milliseconde van een dag als `2026-08-28`, in de getoonde zone. */
function endOfDay(key: string, mode: TimeZoneMode): number {
  const [year, month, day] = key.split('-').map(Number)

  return mode === 'utc'
    ? Date.UTC(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 23, 59, 59, 999).getTime()
}

export function DashboardPage() {
  const [range, setRange] = useState<RangeId>('24h')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [storeId, setStoreId] = useState('')
  // Leeg betekent: volg de periodeknoppen vanaf de laatste meting.
  const [day, setDay] = useState('')
  const [isExportOpen, setIsExportOpen] = useState(false)
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

  // Vergelijken heeft pas betekenis vanaf twee webshops; bij eentje zegt de
  // gewone grafiek hetzelfde.
  const comparison = useComparison(
    stores.length >= 2 ? stores : [],
    autoRefresh ? POLL_INTERVAL_MS : null,
  )

  const visible = useMemo(
    () => (day ? onDay(measurements, day, zone) : withinRange(measurements, range)),
    [measurements, range, day, zone],
  )

  // Grenzen voor de datumkiezer, zodat je geen dagen kunt kiezen waarvoor
  // sowieso niets gemeten is.
  const dayRange = useMemo(() => {
    const first = measurements.at(0)
    const last = measurements.at(-1)
    if (!first || !last) return null

    return {
      min: dayKey(first.timestamp, zone),
      max: dayKey(last.timestamp, zone),
    }
  }, [measurements, zone])
  const latest = visible.at(-1)
  const alerts = useMemo(() => collectAlerts(visible), [visible])

  /**
   * Waar de samengevatte grafieken op eindigen. Kies je een dag, dan is dat
   * middernacht van die dag; anders de laatste meting die er is.
   */
  const anchor = useMemo(
    () => (day ? endOfDay(day, zone) : Date.parse(measurements.at(-1)?.timestamp ?? '')),
    [day, zone, measurements],
  )

  /**
   * De ondertitel onder een samengevatte grafiek. Met een gekozen dag noemt hij
   * die dag, zodat je niet hoeft te raden of je naar vandaag of naar vrijdag kijkt.
   */
  const spanLabelFor = (key: WindowKey): string | undefined => {
    const lookback = LOOKBACK[key]
    if (!lookback) return undefined
    if (!day) return lookback.label

    const dayLabel = formatDayKey(day, zone)
    const days = Math.round(lookback.minutes / (24 * 60))

    return days <= 1 ? `${dayLabel}, per uur` : `${days} dagen t/m ${dayLabel}, per dag`
  }

  const heatmapDays = useMemo(() => {
    if (Number.isNaN(anchor)) return []

    const span = { start: anchor - (HEATMAP_DAYS - 1) * 24 * 60 * 60_000, end: anchor }

    // Nieuwste bovenaan: dat is wat je als eerste wilt zien.
    return bucketStarts(span, 'day', zone)
      .map((at) => dayKey(new Date(at).toISOString(), zone))
      .slice(-HEATMAP_DAYS)
      .reverse()
  }, [anchor, zone])

  const chartPoints = useMemo(() => {
    const points = {} as Record<WindowKey, ChartPoint[]>

    for (const key of WINDOW_KEYS) {
      const lookback = LOOKBACK[key]

      if (!lookback) {
        // Zonder eigen terugblik volgt het venster de filterrij bovenaan.
        points[key] = toChartPoints(visible, key)
        continue
      }

      points[key] = Number.isNaN(anchor)
        ? []
        : bucketedPoints(
            measurements,
            key,
            { start: anchor - lookback.minutes * 60_000, end: anchor },
            lookback.bucket,
            zone,
          )
    }

    return points
  }, [visible, measurements, zone, anchor])

  /**
   * Alleen zinvol in de live-weergave: kijk je naar een dag uit het verleden,
   * dan is "op dit tempo" een uitspraak over een tempo dat allang voorbij is.
   */
  const projections = useMemo(() => {
    const found = {} as Record<WindowKey, ReturnType<typeof projectLimit>>
    for (const key of WINDOW_KEYS) {
      found[key] = day ? null : projectLimit(measurements, key)
    }
    return found
  }, [measurements, day])

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
  const notifications = useNotifications()

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

    const fresh = alerts.filter((candidate) => !previous!.ids.has(idOf(candidate)))
    const where = storeId ? `Store ${storeId}` : 'Webshop'

    for (const alert of fresh) {
      push({
        status: 'critical',
        title: `${windowLabel(alert.windowKey)}-limiet geraakt`,
        body: `${where} kreeg een 429 om ${formatTimeExact(
          alert.iso,
          zone,
        )} — ${formatNumber(alert.used)} van ${formatNumber(alert.limit)} calls.`,
      })
    }

    // Eén systeemmelding voor de hele lading. Raken drie vensters tegelijk hun
    // limiet, dan is dat één gebeurtenis; drie losse meldingen zouden het
    // meldingencentrum vullen met hetzelfde nieuws.
    if (fresh.length > 0) {
      const first = fresh[0]
      const isSingle = fresh.length === 1

      notifications.notify(
        isSingle
          ? `${windowLabel(first.windowKey)}-limiet geraakt`
          : `${fresh.length} limieten geraakt`,
        isSingle
          ? `${where} kreeg een 429 om ${formatTimeExact(first.iso, zone)} — ${formatNumber(
              first.used,
            )} van ${formatNumber(first.limit)} calls.`
          : `${where} kreeg een 429 in ${fresh
              .map((alert) => windowLabel(alert.windowKey))
              .join(', ')}.`,
      )
    }
  }, [
    alerts,
    selectionKey,
    push,
    notifications,
    storeId,
    zone,
    isInitialLoading,
    measurements.length,
  ])

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
        day={day}
        onDayChange={setDay}
        dayRange={dayRange}
        notifications={notifications}
        onExport={() => setIsExportOpen(true)}
        canExport={measurements.length > 0}
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
              projection={projections[PRIMARY_WINDOW]}
            />
            {SECONDARY_WINDOWS.map((key) => (
              <LimitTile
                key={key}
                windowKey={key}
                reading={latest.limits[key]}
                hitCount={hitCounts[key]}
                projection={projections[key]}
              />
            ))}
          </section>

          <section className="app__main">
            <LimitChart
              windowKey={PRIMARY_WINDOW}
              points={chartPoints[PRIMARY_WINDOW]}
              spanLabel={
                day
                  ? formatDayKey(day, zone)
                  : RANGES.find((preset) => preset.id === range)?.label.toLowerCase()
              }
            />
            <AlertList alerts={alerts} />
          </section>

          <section className="app__secondary">
            {SECONDARY_WINDOWS.map((key) => (
              <LimitChart
                key={key}
                windowKey={key}
                points={chartPoints[key]}
                variant="compact"
                spanLabel={spanLabelFor(key)}
                bucket={LOOKBACK[key]?.bucket}
              />
            ))}
          </section>

          {/* Vol bereik, net als de uur- en daggrafieken: een patroon per uur
              zie je pas over meerdere dagen, niet binnen de gekozen periode. */}
          {stores.length >= 2 && (
            <ComparisonChart
              byStore={comparison.byStore}
              windowKey={PRIMARY_WINDOW}
              isLoading={comparison.isLoading}
              failures={comparison.failures}
            />
          )}

          <UsageHeatmap
            measurements={measurements}
            windowKey={PRIMARY_WINDOW}
            days={heatmapDays}
            spanLabel={
              day
                ? `${HEATMAP_DAYS} dagen t/m ${formatDayKey(day, zone)}`
                : `laatste ${HEATMAP_DAYS} dagen`
            }
          />

          <DataTable measurements={visible} />
        </div>
      )}

      {/* De volle reeks gaat mee, niet alleen wat de periodefilter toont:
          in de dialoog kies je zelf het venster. */}
      <ExportDialog
        open={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        measurements={measurements}
        storeId={storeId}
      />

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  )
}
