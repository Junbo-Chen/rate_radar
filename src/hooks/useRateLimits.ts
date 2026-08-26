import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMeasurements, type SourceKind } from "../api/client";
import type { Measurement } from "../api/contract";

interface Options {
  source: SourceKind;
  pollInterval: number | null;
}

interface State {
  measurements: Measurement[];
  isInitialLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  lastUpdated: number | null;
  refresh: () => void;
}

export function useRateLimits({ source, pollInterval }: Options): State {
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const [refreshToken, setRefreshToken] = useState(0);
  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);

  const hasLoadedSource = useRef<SourceKind | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const load = async () => {
      const isFirstLoadForSource = hasLoadedSource.current !== source;
      if (isFirstLoadForSource) {
        setIsInitialLoading(true);
      } else {
        setIsRefreshing(true);
      }

      try {
        const data = await fetchMeasurements(source, controller.signal);
        if (cancelled) return;
        setMeasurements(data);
        setError(null);
        setLastUpdated(Date.now());
        hasLoadedSource.current = source;
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
  }, [source, pollInterval, refreshToken]);

  return { measurements, isInitialLoading, isRefreshing, error, lastUpdated, refresh };
}