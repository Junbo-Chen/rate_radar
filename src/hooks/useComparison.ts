import { useEffect, useState } from 'react'
import { fetchMeasurements } from '../api/client'
import type { Measurement } from '../api/contract'

/** Zoveel metingen per webshop: een etmaal aan 5-minutenslots. */
const COMPARISON_LIMIT = 288

/** Vaste lege waarden, zodat "niets te vergelijken" geen nieuwe render uitlokt. */
const NOTHING: ComparisonState = Object.freeze({
  byStore: Object.freeze({}) as Record<string, Measurement[]>,
  isLoading: false,
  failures: Object.freeze({}) as Record<string, string>,
})

export interface ComparisonState {
  /** Per store_id de opgehaalde metingen. Ontbrekende webshops staan er niet in. */
  byStore: Record<string, Measurement[]>
  isLoading: boolean
  /** Webshops waarvoor het ophalen misliep, met de reden erbij. */
  failures: Record<string, string>
}

/**
 * Haalt van meerdere webshops tegelijk de metingen op.
 *
 * Eén aanroep per webshop, parallel. De back-end filtert op één store_id per
 * keer, en dat is prima: vier verzoeken naast elkaar zijn sneller klaar dan één
 * verzoek dat alles moet samenvoegen, en een webshop met een kapotte sleutel
 * sloopt zo niet de hele vergelijking.
 */
export function useComparison(storeIds: string[], pollInterval: number | null): ComparisonState {
  const [byStore, setByStore] = useState<Record<string, Measurement[]>>({})
  const [failures, setFailures] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)

  // De lijst zelf wisselt van identiteit bij elke render; de inhoud niet.
  const key = storeIds.join('|')

  useEffect(() => {
    // Niets te vergelijken: geen verzoek, en ook geen state-wissel. Het lege
    // antwoord komt hieronder uit NOTHING.
    if (!key) return

    const ids = key.split('|')
    const controller = new AbortController()
    let cancelled = false

    const load = async () => {
      const results = await Promise.all(
        ids.map(async (storeId) => {
          try {
            const measurements = await fetchMeasurements(
              controller.signal,
              storeId,
              COMPARISON_LIMIT,
            )
            return { storeId, measurements, error: null as string | null }
          } catch (cause) {
            if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
            return {
              storeId,
              measurements: [] as Measurement[],
              error: cause instanceof Error ? cause.message : 'Ophalen mislukt.',
            }
          }
        }),
      )

      if (cancelled) return

      const next: Record<string, Measurement[]> = {}
      const problems: Record<string, string> = {}

      for (const result of results) {
        if (result.error) problems[result.storeId] = result.error
        else next[result.storeId] = result.measurements
      }

      setByStore(next)
      setFailures(problems)
      setIsLoading(false)
    }

    void load().catch(() => {
      // Alleen een afgebroken ronde komt hier; die mag niets meer zetten.
    })

    if (pollInterval === null) {
      return () => {
        cancelled = true
        controller.abort()
      }
    }

    const timer = setInterval(() => void load().catch(() => {}), pollInterval)

    return () => {
      cancelled = true
      controller.abort()
      clearInterval(timer)
    }
  }, [key, pollInterval])

  return key ? { byStore, isLoading, failures } : NOTHING
}
