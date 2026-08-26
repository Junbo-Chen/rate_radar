import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { WindowKey } from '../api/contract'
import { windowLabel } from '../api/contract'
import { formatNumber, formatPercent, formatTime, formatTimeExact } from '../lib/format'
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
}

/** Alleen de metingen die een 429 opleverden krijgen een punt: die moeten opvallen. */
function HitDot(props: { cx?: number; cy?: number; payload?: ChartPoint }) {
  const { cx, cy, payload } = props
  if (!payload?.hit429 || cx === undefined || cy === undefined) return <g />
  return (
    <g>
      {/* 2px ring in de ondergrondkleur houdt het punt leesbaar waar het de lijn kruist. */}
      <circle cx={cx} cy={cy} r={6} fill="var(--surface)" />
      <circle cx={cx} cy={cy} r={4.5} fill="var(--status-critical)" />
    </g>
  )
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartPoint }[] }) {
  const point = active ? payload?.[0]?.payload : undefined
  if (!point) return null

  const status = statusOf({ used: point.used, limit: point.limit, hit_429: point.hit429 })

  return (
    <div className="chart-tip">
      <p className="chart-tip__time">{formatTimeExact(point.iso)}</p>
      <p className="chart-tip__value">
        {formatNumber(point.used)} / {formatNumber(point.limit)}
        <span> · {formatPercent(point.ratio)}</span>
      </p>
      <StatusBadge status={status} size="sm" />
    </div>
  )
}

export function LimitChart({ windowKey, points, variant = 'main' }: Props) {
  const limit = points.at(-1)?.limit ?? 0
  const warningAt = limit * WARNING_THRESHOLD
  const peak = points.reduce((max, point) => Math.max(max, point.used), 0)
  const yMax = Math.ceil(Math.max(limit, peak) * 1.06)
  const hitCount = points.filter((point) => point.hit429).length

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round(limit * fraction))
  const isCompact = variant === 'compact'

  return (
    <figure className={`chart chart--${variant}`}>
      <figcaption className="chart__caption">
        <div>
          <h3 className="chart__title">Verbruik per {windowLabel(windowKey)}-venster</h3>
          <p className="chart__subtitle">
            Gemeten calls tegenover de limiet van {formatNumber(limit)}
          </p>
        </div>
        {hitCount > 0 && <StatusBadge status="critical" size="sm" label={`${hitCount}× 429`} />}
      </figcaption>

      <div className="chart__plot" style={{ blockSize: isCompact ? 190 : 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 58, bottom: 4, left: 4 }}>
            {/* De gevarenzone: oranje vanaf 80%, rood vanaf de limiet. Een wash,
                geen vlak blok — de data blijft het luidste element. */}
            <ReferenceArea
              y1={warningAt}
              y2={limit}
              fill="var(--status-warning)"
              fillOpacity={0.08}
              stroke="none"
            />
            <ReferenceArea
              y1={limit}
              y2={yMax}
              fill="var(--status-critical)"
              fillOpacity={0.1}
              stroke="none"
            />

            <CartesianGrid stroke="var(--grid)" strokeWidth={1} vertical={false} />

            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(value: number) => formatTime(new Date(value).toISOString())}
              minTickGap={isCompact ? 48 : 36}
              tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--axis)' }}
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
              content={<ChartTooltip />}
              cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }}
            />

            <ReferenceLine
              y={warningAt}
              stroke="var(--status-warning)"
              strokeWidth={1}
              label={{
                value: '80%',
                position: 'right',
                fill: 'var(--text-secondary)',
                fontSize: 11,
              }}
            />
            <ReferenceLine
              y={limit}
              stroke="var(--status-critical)"
              strokeWidth={1}
              label={{
                value: 'Limiet',
                position: 'right',
                fill: 'var(--text-secondary)',
                fontSize: 11,
                fontWeight: 600,
              }}
            />

            <Area
              type="monotone"
              dataKey="used"
              stroke="none"
              fill="var(--series)"
              fillOpacity={0.1}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="used"
              stroke="var(--series)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={<HitDot />}
              activeDot={{
                r: 4.5,
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
