import { parseMeasurements, type Measurement } from "./contract";
import { apiFetch } from "./http";

export const LIVE_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/account/ratelimit";

/** De gekozen webshop gaat als `store_id` mee naar de back-end. */
export function sourceUrl(storeId?: string): string {
  if (!storeId) return LIVE_URL;

  // Tweede argument vangt een relatieve VITE_API_URL op; zonder dat gooit URL().
  const url = new URL(LIVE_URL, window.location.origin);
  url.searchParams.set("store_id", storeId);
  return url.toString();
}

export async function fetchMeasurements(
  signal?: AbortSignal,
  storeId?: string,
): Promise<Measurement[]> {
  const url = sourceUrl(storeId);

  // apiFetch stuurt het sessiecookie mee en vertaalt een 401 naar uitloggen.
  const response = await apiFetch(url, { signal });

  if (!response.ok) {
    throw new Error(`${url} gaf HTTP ${response.status} ${response.statusText}.`);
  }

  // De metingen houden hun eigen tijdstempels — precies wat de bron teruggeeft.
  // Wat er wél afgaat: metingen die nog niet gebeurd kunnen zijn. Een dashboard
  // hoort niet te tonen wat nog moet komen.
  return excludeFuture(parseMeasurements(await response.json()));
}

/**
 * Speling voor klokverschil tussen de Laravel-server en deze browser. Zonder
 * dit valt een verse meting weg zodra de server een paar seconden voorloopt —
 * en dan blijft het dashboard leeg terwijl de API prima werkt.
 */
const CLOCK_SKEW_MS = 2 * 60 * 1000;

/** Laat alleen metingen door waarvan het tijdstip al geweest is. */
function excludeFuture(measurements: Measurement[], now: number = Date.now()): Measurement[] {
  const cutoff = now + CLOCK_SKEW_MS;
  return measurements.filter((measurement) => Date.parse(measurement.timestamp) <= cutoff);
}
