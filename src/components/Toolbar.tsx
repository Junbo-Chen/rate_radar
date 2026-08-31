import { useCallback, useId, useRef, useState } from 'react'
import { useDismissable } from '../hooks/useDismissable'
import type { NotificationsState } from '../hooks/useNotifications'
import './Toolbar.css'

/** Periodes zijn relatief aan de laatste meting, niet aan de wandklok, zodat
 *  een haperende back-end geen lege selectie oplevert. */
export const RANGES = [
  { id: '24h', label: 'Laatste 24 uur', minutes: 1440 },
  { id: '4h', label: 'Laatste 4 uur', minutes: 240 },
  { id: '1h', label: 'Laatste uur', minutes: 60 },
] as const

export type RangeId = (typeof RANGES)[number]['id']

interface Props {
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
  /** Gekozen dag als YYYY-MM-DD; leeg betekent: de meest recente metingen. */
  day: string
  onDayChange: (day: string) => void
  /** Eerste en laatste dag waarvoor metingen bestaan. */
  dayRange: { min: string; max: string } | null
  notifications: NotificationsState
  /** Downloadt de metingen die nu in beeld zijn als CSV. */
  onExport: () => void
  canExport: boolean
}

function SegmentedControl<T extends string>({
  legend,
  options,
  value,
  onChange,
  disabled,
  disabledHint,
}: {
  legend: string
  options: readonly { id: T; label: string }[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
  disabledHint?: string
}) {
  return (
    <div className="toolbar__group" role="group" aria-label={legend}>
      <span className="toolbar__legend">{legend}</span>
      <div className="segmented" data-disabled={disabled || undefined}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className="segmented__option"
            aria-pressed={!disabled && value === option.id}
            disabled={disabled}
            title={disabled ? disabledHint : undefined}
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
 * De schakelaars die je één keer instelt en daarna laat staan: verversen en
 * meldingen. Los in de rij duwden ze de filters en de knoppen uit beeld op een
 * smal scherm, terwijl je ze zelden aanraakt. Achter één knop blijft de rij
 * leesbaar en blijft alles bereikbaar.
 *
 * Het stipje op de knop verraadt of er iets aanstaat, zodat je het paneel niet
 * hoeft te openen om dat te zien.
 */
function SettingsMenu({
  autoRefresh,
  onAutoRefreshChange,
  notifications,
}: Pick<Props, 'autoRefresh' | 'onAutoRefreshChange' | 'notifications'>) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  const close = useCallback(() => setIsOpen(false), [])
  useDismissable({ isOpen, onDismiss: close, containerRef, triggerRef })

  const isDenied = notifications.permission === 'denied'
  const hasActive = autoRefresh || notifications.enabled

  return (
    <div className="toolbar__menu" ref={containerRef}>
      <button
        type="button"
        ref={triggerRef}
        className="button toolbar__menu-trigger"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        data-active={hasActive || undefined}
      >
        Instellingen
      </button>

      {isOpen && (
        <div className="toolbar__panel" id={panelId} role="group" aria-label="Instellingen">
          <label className="toolbar__switch">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(event) => onAutoRefreshChange(event.target.checked)}
            />
            Elke minuut verversen
          </label>

          {notifications.supported && (
            <>
              <label
                className="toolbar__switch"
                data-disabled={isDenied || undefined}
                title={
                  isDenied
                    ? 'Je browser blokkeert meldingen voor deze site. Zet ze aan via het slotje in de adresbalk.'
                    : 'Waarschuwt je ook als dit tabblad op de achtergrond staat.'
                }
              >
                <input
                  type="checkbox"
                  checked={notifications.enabled}
                  disabled={isDenied}
                  onChange={() => void notifications.toggle()}
                />
                Melding bij 429
              </label>

              {notifications.enabled && (
                <label className="toolbar__switch">
                  <input
                    type="checkbox"
                    checked={notifications.sound}
                    onChange={(event) => notifications.setSound(event.target.checked)}
                  />
                  Geluid
                </label>
              )}

              {isDenied && (
                <p className="toolbar__panel-note">
                  Meldingen staan geblokkeerd in je browser. Zet ze aan via het slotje in de
                  adresbalk en herlaad de pagina.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Eén filterrij boven alles wat hij bestuurt — alle grafieken renderen tegen
 * dezelfde selectie, in plaats van elk hun eigen filtertje te krijgen.
 *
 * Links wat je kiest, rechts wat je doet. Daartussen groeit de ruimte mee, dus
 * de knoppen blijven op hun plek als er een webshop bij komt.
 */
export function Toolbar({
  range,
  onRangeChange,
  autoRefresh,
  onAutoRefreshChange,
  onRefresh,
  isRefreshing,
  stores,
  storeId,
  onStoreChange,
  day,
  onDayChange,
  dayRange,
  notifications,
  onExport,
  canExport,
}: Props) {
  return (
    <div className="toolbar">
      <div className="toolbar__filters">
        <div className="toolbar__group">
          <label className="toolbar__legend" htmlFor="store-select">
            Webshop
          </label>
          <select
            id="store-select"
            className="toolbar__select"
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

        <div className="toolbar__group">
          <label className="toolbar__legend" htmlFor="day-input">
            Dag
          </label>
          <div className="toolbar__day">
            <input
              id="day-input"
              type="date"
              className="toolbar__date"
              value={day}
              min={dayRange?.min}
              max={dayRange?.max}
              onChange={(event) => onDayChange(event.target.value)}
              title="Toont die hele dag, van middernacht tot middernacht."
            />
            {day && (
              <button
                type="button"
                className="toolbar__day-clear"
                onClick={() => onDayChange('')}
                aria-label="Dag wissen en terug naar de recentste metingen"
                title="Terug naar de recentste metingen"
              >
                &times;
              </button>
            )}
          </div>
        </div>

        <SegmentedControl
          legend="Periode"
          options={RANGES.map(({ id, label }) => ({ id, label }))}
          value={range}
          onChange={onRangeChange}
          disabled={day !== ''}
          disabledHint="Er is een dag gekozen; die toont altijd het hele etmaal."
        />
      </div>

      <div className="toolbar__actions">
        <SettingsMenu
          autoRefresh={autoRefresh}
          onAutoRefreshChange={onAutoRefreshChange}
          notifications={notifications}
        />
        <button
          type="button"
          className="button"
          onClick={onExport}
          disabled={!canExport}
          title={canExport ? undefined : 'Er zijn geen metingen in deze periode om te exporteren.'}
        >
          Exporteer CSV
        </button>
        <button
          type="button"
          className="button button--primary"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? 'Bezig…' : 'Ververs nu'}
        </button>
      </div>
    </div>
  )
}
