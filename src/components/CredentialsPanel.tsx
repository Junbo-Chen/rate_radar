import { useMemo, useState } from 'react'
import { maskKey, validate, type Credential, type CredentialInput } from '../api/credentials'
import { useCredentials } from '../hooks/useCredentials'
import { useRateLimits } from '../hooks/useRateLimits'
import { useTimezone } from '../hooks/useTimezone'
import { dayKey, formatDateTime, formatDayKey } from '../lib/format'
import { collectAlerts } from './AlertList'
import { Modal } from './Modal'
import { StatusBadge } from './StatusBadge'
import './CredentialsPanel.css'

const EMPTY: CredentialInput = { store_id: '', api_key: '', api_secret: '' }

/** Wat de popup toont: niets, een nieuwe rij, of een bestaande rij. */
type Editing = { mode: 'new' } | { mode: 'edit'; row: Credential } | null

export function CredentialsPanel() {
  const { items, isLoading, isSaving, error, create, update, remove } = useCredentials()
  const { mode } = useTimezone()

  // Terugval voor de 429-kolom. De metingen dragen geen store_id, dus dit is
  // het totaal over de hele reeks — pas als de back-end `hits_429` per
  // credential meestuurt, klopt het getal per webshop.
  const { measurements } = useRateLimits({ pollInterval: null })
  const totalHits = useMemo(() => collectAlerts(measurements).length, [measurements])

  /**
   * Eén emmer per kalenderdag in de reeks, nieuwste eerst. Ook dagen zonder
   * 429 krijgen een emmer: "die dag was het rustig" is ook een antwoord.
   */
  const dayBuckets = useMemo(() => {
    const buckets = new Map<string, { key: string; ms: number; hits: number }>()

    for (const measurement of measurements) {
      const key = dayKey(measurement.timestamp, mode)
      if (!buckets.has(key)) {
        buckets.set(key, { key, ms: Date.parse(measurement.timestamp), hits: 0 })
      }
    }

    for (const alert of collectAlerts(measurements)) {
      const bucket = buckets.get(dayKey(alert.iso, mode))
      if (bucket) bucket.hits += 1
    }

    return [...buckets.values()].sort((a, b) => b.ms - a.ms)
  }, [measurements, mode])

  /** Lege string = alle dagen bij elkaar. */
  const [day, setDay] = useState('')

  // Uit de kalender kun je elke datum kiezen, ook een zonder metingen. Dat is
  // geen fout: "0" en "niets gemeten" zijn alleen verschillende antwoorden, en
  // die hieronder houden we uit elkaar.
  const dayHasData = day === '' || dayBuckets.some((bucket) => bucket.key === day)

  const hitsForSelection = day
    ? (dayBuckets.find((bucket) => bucket.key === day)?.hits ?? 0)
    : totalHits

  // `hits_429` van de back-end is een totaal, dus dat geldt alleen wanneer er
  // geen losse dag gekozen is.
  const hitsFor = (row: Credential) => (day ? hitsForSelection : (row.hits_429 ?? totalHits))

  // Grenzen van de kalender: buiten de reeks valt sowieso niets te tellen.
  const firstDay = dayBuckets.at(-1)?.key
  const lastDay = dayBuckets[0]?.key

  const [editing, setEditing] = useState<Editing>(null)
  const [form, setForm] = useState<CredentialInput>(EMPTY)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const isEdit = editing?.mode === 'edit'

  const openNew = () => {
    setForm(EMPTY)
    setFormError(null)
    setEditing({ mode: 'new' })
  }

  const openEdit = (row: Credential) => {
    // Het secret komt nooit terug van de server, dus dat veld begint leeg.
    setForm({ store_id: row.store_id, api_key: row.api_key, api_secret: '' })
    setFormError(null)
    setEditing({ mode: 'edit', row })
  }

  const close = () => {
    setEditing(null)
    setFormError(null)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!editing) return

    const problem = validate(form, isEdit)
    if (problem) {
      setFormError(problem)
      return
    }

    const ok = editing.mode === 'edit' ? await update(editing.row.id, form) : await create(form)
    if (ok) close()
  }

  const field = (key: keyof CredentialInput) => ({
    value: form[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      setForm((current) => ({ ...current, [key]: event.target.value }))
      setFormError(null)
    },
  })

  return (
    <section className="creds">
      <header className="creds__head">
        <h2 className="creds__title">API-credentials</h2>
        <button type="button" className="button button" onClick={openNew}>
          Nieuwe credential
        </button>
      </header>

      {error && (
        <div className="creds__error" role="alert">
          <StatusBadge status="critical" size="sm" label="Mislukt" />
          <div>
            <p>{error}</p>
            <p className="creds__error-hint">
              Credentials worden alleen door de back-end bewaard. De Laravel-app heeft nog geen
              routes naar <code>ApiCredentialsController</code> — vraag Eric om{' '}
              <code>Route::apiResource('credentials', ...)</code> in <code>routes/api.php</code>,
              met JSON in plaats van Blade-views.
            </p>
          </div>
        </div>
      )}

      {dayBuckets.length > 0 && items.length > 0 && (
        <div className="creds__filter">
          <label className="creds__filter-label" htmlFor="hits-day">
            Rate limit hits op
          </label>
          <input
            id="hits-day"
            type="date"
            className="select_webshop"
            value={day}
            min={firstDay}
            max={lastDay}
            onChange={(event) => setDay(event.target.value)}
          />

          {day ? (
            <>
              <span className="creds__filter-count">
                {dayHasData
                  ? `${formatDayKey(day, mode)} · ${hitsForSelection}×`
                  : `${formatDayKey(day, mode)} · niets gemeten`}
              </span>
              <button type="button" className="button" onClick={() => setDay('')}>
                Alle dagen
              </button>
            </>
          ) : (
            <span className="creds__filter-count">
              alle dagen · {totalHits}× over {dayBuckets.length} dag(en)
            </span>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="creds__empty">Laden…</p>
      ) : items.length === 0 ? (
        <p className="creds__empty">Nog geen credentials. Voeg de eerste webshop toe.</p>
      ) : (
        <div className="creds__scroll">
          <table className="creds__table">
            <thead>
              <tr>
                <th scope="col">Store ID</th>
                <th scope="col">API key</th>
                <th scope="col">Secret</th>
                <th scope="col">rate_limit hits</th>
                <th scope="col">Toegevoegd</th>
                <th scope="col">
                  <span className="creds__sr">Acties</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.store_id}</th>
                  <td className="creds__mono">{maskKey(row.api_key)}</td>
                  <td className="creds__mono">••••{row.api_secret_last4}</td>
                  <td>
                    {hitsFor(row) > 0 ? (
                      <StatusBadge status="critical" size="sm" label={`${hitsFor(row)}×`} />
                    ) : (
                      <span className="creds__zero">0</span>
                    )}
                  </td>
                  <td>{formatDateTime(row.created_at, mode)}</td>
                  <td className="creds__row-actions">
                    {pendingDelete === row.id ? (
                      <>
                        <span className="creds__confirm">Zeker weten?</span>
                        <button
                          type="button"
                          className="button button--danger"
                          onClick={async () => {
                            await remove(row.id)
                            setPendingDelete(null)
                          }}
                          disabled={isSaving}
                        >
                          Verwijder
                        </button>
                        <button
                          type="button"
                          className="button"
                          onClick={() => setPendingDelete(null)}
                        >
                          Nee
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="button" onClick={() => openEdit(row)}>
                          Bewerk
                        </button>
                        <button
                          type="button"
                          className="button"
                          onClick={() => setPendingDelete(row.id)}
                        >
                          Verwijder
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={editing !== null}
        title={isEdit ? 'Credential bewerken' : 'Nieuwe credential'}
        onClose={close}
      >
        <form className="creds__form" onSubmit={submit}>
          <label className="creds__field">
            <span>Store ID</span>
            <input {...field('store_id')} placeholder="bijv. 12345" autoComplete="off" autoFocus />
          </label>

          <label className="creds__field">
            <span>API key</span>
            <input {...field('api_key')} placeholder="bijv. 8f2c…" autoComplete="off" />
          </label>

          <label className="creds__field">
            <span>
              API secret
              {isEdit && <em className="creds__hint"> — leeg laten = ongewijzigd</em>}
            </span>
            <input
              {...field('api_secret')}
              type="password"
              placeholder={isEdit ? '••••••••' : 'wordt niet teruggetoond'}
              autoComplete="new-password"
            />
          </label>

          {formError && <p className="creds__form-error">{formError}</p>}

          <div className="creds__actions">
            <button type="submit" className="button button" disabled={isSaving}>
              {isSaving ? 'Bezig…' : isEdit ? 'Opslaan' : 'Toevoegen'}
            </button>
            <button type="button" className="button" onClick={close} disabled={isSaving}>
              Annuleren
            </button>
          </div>
        </form>
      </Modal>
    </section>
  )
}
