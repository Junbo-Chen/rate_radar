import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMeasurements } from "../api/client";
import type { Measurement } from "../api/contract";

interface Options {
  pollInterval: number | null;
  /** Leeg of weggelaten betekent: alle webshops. */
  storeId?: string;
}

interface State {
  measurements: Measurement[];
  isInitialLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  lastUpdated: number | null;
  refresh: () => void;
}

/** Zoveel metingen houden we vast: een week aan 5-minuten-slots. */
const MAX_HISTORY = 2016;

/**
 * Voegt nieuwe metingen bij de bestaande, ontdubbeld op tijdstempel en
 * oplopend gesorteerd. Dezelfde meting twee keer ophalen verandert dus niets.
 */
function mergeByTimestamp(current: Measurement[], incoming: Measurement[]): Measurement[] {
  const byTimestamp = new Map(current.map((row) => [row.timestamp, row]));
  for (const row of incoming) byTimestamp.set(row.timestamp, row);

  return [...byTimestamp.values()]
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .slice(-MAX_HISTORY);
}

export function useRateLimits({ pollInterval, storeId }: Options): State {
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const [refreshToken, setRefreshToken] = useState(0);
  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);

  // Wisselt de webshop, dan is dat een nieuwe selectie en hoort er een echte
  // laadstatus bij in plaats van een stille verversing.
  const selection = storeId ?? "";
  const hasLoadedSource = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const load = async () => {
      const isFirstLoadForSource = hasLoadedSource.current !== selection;
      if (isFirstLoadForSource) {
        setIsInitialLoading(true);
      } else {
        setIsRefreshing(true);
      }

      try {
        const data = await fetchMeasurements(controller.signal, storeId);
        if (cancelled) return;

        // De API geeft één momentopname per aanroep, geen geschiedenis. Die
        // stapelen we hier op, zodat de grafieken zich vullen zolang de pagina
        // open staat.
        setMeasurements((current) =>
          isFirstLoadForSource ? data : mergeByTimestamp(current, data),
        );
        setError(null);
        setLastUpdated(Date.now());
        hasLoadedSource.current = selection;
      } catch (cause) {
        if (cancelled || (cause instanceof DOMException && cause.name === "AbortError")) return;
        setError(cause instanceof Error ? cause.message : "Onbekende fout bij het ophalen.");
        if (isFirstLoadForSource) setMeasurements([]);
      } finally {
        if (!cancelled) {
          setIsInitialLoading(false);
          setIsRefreshing(false);
        }
      }
    };

    void load();

    if (pollInterval === null) {
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    const timer = setInterval(() => void load(), pollInterval);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [pollInterval, refreshToken, storeId, selection]);

  return { measurements, isInitialLoading, isRefreshing, error, lastUpdated, refresh };
}