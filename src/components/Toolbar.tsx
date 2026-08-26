import type { SourceKind } from '../api/client'
import './Toolbar.css'

/** Periodes zijn relatief aan de laatste meting, niet aan de wandklok — de
 *  mockup speelt zich in het verleden af en zou anders leeg filteren. */
export const RANGES = [
  { id: 'all', label: 'Alles' },
  { id: '4h', label: 'Laatste 4 uur', minutes: 240 },
  { id: '1h', label: 'Laatste uur', minutes: 60 },
] as const

export type RangeId = (typeof RANGES)[number]['id']

interface Props {
  source: SourceKind
  onSourceChange: (source: SourceKind) => void
  range: RangeId
  onRangeChange: (range: RangeId) => void
  autoRefresh: boolean
  onAutoRefreshChange: (enabled: boolean) => void
  onRefresh: () => void
  isRefreshing: boolean
  /** Store IDs uit de opgeslagen credentials. */
  stores: string[]
  /** Lege string = alle webshops. */
  storeId: string
  onStoreChange: (storeId: string) => void
}

function SegmentedControl<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string
  options: readonly { id: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="toolbar__group" role="group" aria-label={legend}>
      <span className="toolbar__legend">{legend}</span>
      <div className="segmented">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className="segmented__option"
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Eén filterrij boven alles wat hij bestuurt — alle grafieken renderen tegen
 * dezelfde selectie, in plaats van elk hun eigen filtertje te krijgen.
 */
export function Toolbar({
  source,
  onSourceChange,
  range,
  onRangeChange,
  autoRefresh,
  onAutoRefreshChange,
  onRefresh,
  isRefreshing,
  stores,
  storeId,
  onStoreChange,
}: Props) {
  return (
    <div className="toolbar">
      <SegmentedControl
        legend="Databron"
        options={[
          { id: 'mock', label: 'Mockup' },
          { id: 'live', label: 'Live API' },
        ]}
        value={source}
        onChange={onSourceChange}
      />

      <div className="toolbar__group" role="group" aria-label="Webshop">
        <label className="toolbar__legend" htmlFor="store-select">
          Webshop
        </label>
        <select
          id="store-select"
          className="select_webshop"
          value={storeId}
          onChange={(event) => onStoreChange(event.target.value)}
        >
          <option value="">Alle webshops</option>
          {stores.map((store) => (
            <option key={store} value={store}>
              Store {store}
            </option>
          ))}
        </select>
      </div>

      <SegmentedControl
        legend="Periode"
        options={RANGES.map(({ id, label }) => ({ id, label }))}
        value={range}
        onChange={onRangeChange}
      />


      <div className="toolbar__group toolbar__group--end">
        <label className="toolbar__switch">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(event) => onAutoRefreshChange(event.target.checked)}
          />
          Elke minuut verversen
        </label>
        <button type="button" className="button" onClick={onRefresh} disabled={isRefreshing}>
          {isRefreshing ? 'Bezig…' : 'Ververs nu'}
        </button>
      </div>
    </div>
  )
}
