import { useEffect, useMemo, useState } from 'react'
import type { Measurement } from '../api/contract'
import { useTimezone } from '../hooks/useTimezone'
import { csvFilename, downloadCsv, toCsv } from '../lib/csv'
import {
  formatDateTime,
  formatNumber,
  fromDateTimeInput,
  toDateTimeInput,
  zoneCaption,
} from '../lib/format'
import { Modal } from './Modal'
import './ExportDialog.css'

interface Props {
  open: boolean
  onClose: () => void
  /** De volle reeks: je mag verder terug exporteren dan de periodefilter toont. */
  measurements: Measurement[]
  storeId: string
}

/**
 * Kiest een venster en schrijft dat weg als CSV.
 *
 * De velden staan bij het openen op de uiterste tijdstippen van de reeks, zodat
 * "gewoon alles" één klik is en het inperken een bewuste handeling.
 */
export function ExportDialog({ open, onClose, measurements, storeId }: Props) {
  const { mode } = useTimezone()

  const bounds = useMemo(() => {
    const first = measurements.at(0)
    const last = measurements.at(-1)

    return first && last
      ? { from: Date.parse(first.timestamp), to: Date.parse(last.timestamp) }
      : null
  }, [measurements])

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  // Bij elke opening opnieuw op de uitersten zetten. Blijft een oude keuze
  // staan, dan exporteer je zonder het te merken een venster van gisteren.
  useEffect(() => {
    if (!open || !bounds) return

    setFrom(toDateTimeInput(bounds.from, mode))
    // Een minuut ruimte, want het veld heeft geen seconden: zonder dit valt de
    // laatste meting net buiten de selectie.
    setTo(toDateTimeInput(bounds.to + 60_000, mode))
  }, [open, bounds, mode])

  const fromMs = fromDateTimeInput(from, mode)
  const toMs = fromDateTimeInput(to, mode)

  const isRangeValid = !Number.isNaN(fromMs) && !Number.isNaN(toMs) && fromMs <= toMs

  const selected = useMemo(() => {
    if (!isRangeValid) return []

    return measurements.filter((measurement) => {
      const at = Date.parse(measurement.timestamp)
      return at >= fromMs && at <= toMs
    })
  }, [measurements, fromMs, toMs, isRangeValid])

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (selected.length === 0) return

    downloadCsv(csvFilename(storeId), toCsv(selected, mode))
    onClose()
  }

  return (
    <Modal open={open} title="Exporteren naar CSV" onClose={onClose}>
      <form className="export__form" onSubmit={submit}>
        <div className="export__fields">
          <label className="export__field">
            <span>Van</span>
            <input
              type="datetime-local"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              max={to || undefined}
            />
          </label>

          <label className="export__field">
            <span>Tot</span>
            <input
              type="datetime-local"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              min={from || undefined}
            />
          </label>
        </div>

        <p className="export__caption">{zoneCaption(mode)}</p>

        {bounds && (
          <p className="export__caption">
            Beschikbaar: {formatDateTime(new Date(bounds.from).toISOString(), mode)} tot{' '}
            {formatDateTime(new Date(bounds.to).toISOString(), mode)}
          </p>
        )}

        {/* De telling vooraf voorkomt de klassieke verrassing: een bestand
            downloaden en pas in Excel zien dat het leeg is. */}
        <p className="export__count" data-empty={selected.length === 0 || undefined}>
          {!isRangeValid
            ? '"Van" ligt na "Tot" — draai de tijden om.'
            : selected.length === 0
              ? 'Geen metingen in dit venster.'
              : `${formatNumber(selected.length)} metingen worden geëxporteerd.`}
        </p>

        <div className="export__actions">
          <button type="submit" className="button button--primary" disabled={selected.length === 0}>
            Downloaden
          </button>
          <button type="button" className="button" onClick={onClose}>
            Annuleren
          </button>
        </div>
      </form>
    </Modal>
  )
}
