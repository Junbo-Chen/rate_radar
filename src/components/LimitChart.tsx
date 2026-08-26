import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { WindowKey } from '../api/contract'
import { windowLabel } from '../api/contract'
import { useTimezone } from '../hooks/useTimezone'
import { formatDay, formatNumber, formatPercent, formatTime, formatTimeExact } from '../lib/format'
import { statusOf, WARNING_THRESHOLD } from '../lib/status'
import { StatusBadge } from './StatusBadge'
import './LimitChart.css'

export interface ChartPoint {
  /** Tijdstip in ms, zodat de x-as echte afstanden aanhoudt bij gaten in de reeks. */
  t: number
  iso: string
  used: number
  limit: number
  ratio: number
  hit429: boolean
}

interface Props {
  windowKey: WindowKey
  points: ChartPoint[]
  variant?: 'main' | 'compact'
  /** Welke periode deze grafiek beslaat, bijv. "laatste 7 dagen". */
  spanLabel?: string
  /** Gezet wanneer elk punt een uur of een dag samenvat in plaats van één meting. */
  bucket?: 'hour' | 'day'
}

/**
 * Een punt per meting. De ring in de ondergrondkleur houdt ze leesbaar waar ze
 * de lijn of elkaar raken — een randje eromheen tekenen zou inkt toevoegen die
 * geen data is.
 *
 * Een 429 krijgt een grotere rode stip, zodat die tussen de gewone punten
 * blijft opvallen.
 */
function DataDot(props: { cx?: number; cy?: number; payload?: ChartPoint; radius?: number }) {
  const { cx, cy, payload, radius = 3 } = props
  if (cx === undefined || cy === undefined || !payload) return <g />

  if (payload.hit429) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={radius + 3} fill="var(--surface)" />
        <circle cx={cx} cy={cy} r={radius + 1.5} fill="var(--status-critical)" />
      </g>
    )
  }

  return (
    <g>
      <circle cx={cx} cy={cy} r={radius + 1.5} fill="var(--surface)" />
      <circle cx={cx} cy={cy} r={radius} fill="var(--series)" />
    </g>
  )
}

function ChartTooltip({
  active,
  payload,
  bucket,
}: {
  active?: boolean
  payload?: { payload: ChartPoint }[]
  bucket?: 'hour' | 'day'
}) {
  const { mode } = useTimezone()
  const point = active ? payload?.[0]?.payload : undefined
  if (!point) return null

  const status = statusOf({ used: point.used, limit: point.limit, hit_429: point.hit429 })

  // Een samengevat punt noemt zijn periode; een losse meting het exacte tijdstip.
  const heading =
    bucket === 'day'
      ? formatDay(point.iso, mode)
      : bucket === 'hour'
        ? `${formatDay(point.iso, mode)} · ${formatTime(point.iso, mode)}`
        : formatTimeExact(point.iso, mode)

  return (
    <div className="chart-tip">
      <p className="chart-tip__time">
        {heading}
        {bucket && <span className="chart-tip__peak"> · hoogste stand</span>}
      </p>
      <p className="chart-tip__value">
        {formatNumber(point.used)} / {formatNumber(point.limit)}
        <span> · {formatPercent(point.ratio)}</span>
      </p>
      <StatusBadge status={status} size="sm" />
    </div>
  )
}

export function LimitChart({
  windowKey,
  points,
  variant = 'main',
  spanLabel,
  bucket,
}: Props) {
  const { mode } = useTimezone()
  const limit = points.at(-1)?.limit ?? 0
  const warningAt = limit * WARNING_THRESHOLD
  const peak = points.reduce((max, point) => Math.max(max, point.used), 0)
  const yMax = Math.ceil(Math.max(limit, peak) * 1.06)
  const hitCount = points.filter((point) => point.hit429).length

  // Weinig raster: alleen de bodem en de helft. De 80%-grens en de limiet
  // hebben hun eigen gekleurde lijn, dus die hoeven er niet nog eens als tick bij.
  const ticks = [0, Math.round(limit * 0.5)]
  const isCompact = variant === 'compact'

  // Puntgrootte volgt de dichtheid. Bij 96 metingen op een halve schermbreedte
  // staan ze zo'n 7px uit elkaar; een stip van 3px zou dan aan elkaar plakken.
  const dotRadius = points.length > 120 ? 1.75 : points.length > 60 ? 2.25 : 3

  // Beslaat de as meer dan een etmaal, dan labelen we met de datum: een
  // kloktijd herhaalt zich dan en zegt niets meer over wélke dag je ziet.
  const spanMs = points.length > 1 ? points[points.length - 1].t - points[0].t : 0
  const labelWithDate = spanMs > 36 * 60 * 60 * 1000

  return (
    <figure className={`chart chart--${variant}`}>
      <figcaption className="chart__caption">
        <div>
          <h3 className="chart__title">Verbruik per {windowLabel(windowKey)}-venster</h3>
          <p className="chart__subtitle">
            Gemeten calls tegenover de limiet van {formatNumber(limit)}
            {spanLabel && <> · {spanLabel}</>}
          </p>
        </div>
        {hitCount > 0 && <StatusBadge status="critical" size="sm" label={`${hitCount}× 429`} />}
      </figcaption>

      <div className="chart__plot" style={{ blockSize: isCompact ? 190 : 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 58, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="var(--grid)" strokeWidth={1} vertical={false} />

            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(value: number) => {
                const iso = new Date(value).toISOString()
                return labelWithDate ? formatDay(iso, mode) : formatTime(iso, mode)
              }}
              minTickGap={isCompact ? 48 : 36}
              tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[0, yMax]}
              ticks={ticks}
              tickFormatter={formatNumber}
              width={isCompact ? 46 : 54}
              tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />

            <Tooltip
              content={<ChartTooltip bucket={bucket} />}
              cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }}
            />

            {/* Zachte grens gestippeld, harde limiet vol: het verschil tussen
                "let op" en "hier gaat het mis" zit zo ook in de vorm, niet
                alleen in de kleur. */}
            <ReferenceLine
              y={warningAt}
              stroke="var(--status-warning)"
              strokeWidth={1}
              strokeDasharray="3 4"
              label={{
                value: '80%',
                position: 'right',
                fill: 'var(--text-muted)',
                fontSize: 11,
              }}
            />
            <ReferenceLine
              y={limit}
              stroke="var(--status-critical)"
              strokeWidth={1.5}
              label={{
                value: 'Limiet',
                position: 'right',
                fill: 'var(--text-secondary)',
                fontSize: 11,
                fontWeight: 600,
              }}
            />

            {/* Vloeiende curve tussen de metingen. De punten zelf tonen waar
                echt gemeten is; de lijn ertussen is de verbinding. */}
            <Line
              type="monotone"
              dataKey="used"
              stroke="var(--series)"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={<DataDot radius={dotRadius} />}
              activeDot={{
                r: dotRadius + 2,
                fill: 'var(--series)',
                stroke: 'var(--surface)',
                strokeWidth: 2,
              }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
