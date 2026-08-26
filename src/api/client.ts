import { parseMeasurements, type Measurement } from "./contract";

export type SourceKind = "mock" | "live";

export const MOCK_URL = "/mock/rate-limits.json";

export const LIVE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/rate-limits";

/**
 * De gekozen webshop gaat als `store_id` mee naar de back-end. Het mockbestand
 * is één vaste reeks zonder store-dimensie, dus daar valt niets te filteren.
 */
export function sourceUrl(kind: SourceKind, storeId?: string): string {
  if (kind === "mock") return MOCK_URL;
  if (!storeId) return LIVE_URL;

  // Tweede argument vangt een relatieve VITE_API_URL op; zonder dat gooit URL().
  const url = new URL(LIVE_URL, window.location.origin);
  url.searchParams.set("store_id", storeId);
  return url.toString();
}

export async function fetchMeasurements(
  kind: SourceKind,
  signal?: AbortSignal,
  storeId?: string,
): Promise<Measurement[]> {
  const url = sourceUrl(kind, storeId);

  let response: Response;
  try {
    response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new Error(
      kind === "live"
        ? `Geen verbinding met ${url}. Draait de Laravel-server al?`
        : `Kon het mockup-bestand niet laden (${url}).`,
    );
  }

  if (!response.ok) {
    throw new Error(`${url} gaf HTTP ${response.status} ${response.statusText}.`);
  }

  // De metingen houden hun eigen tijdstempels — precies wat de bron teruggeeft.
  // Ze naar "nu" schuiven zou de tijden op het scherm laten afwijken van wat er
  // in het bestand (en straks in Eric's database) staat.
  //
  // Wat er wél afgaat: metingen die nog niet gebeurd kunnen zijn. De mockup is
  // een vaste dagreeks tot 15:59:55Z, dus vroeg op de dag staat een deel daarvan
  // in de toekomst. Een dashboard hoort niet te tonen wat nog moet komen.
  return excludeFuture(parseMeasurements(await response.json()))
}

/** Laat alleen metingen door waarvan het tijdstip al geweest is. */
function excludeFuture(measurements: Measurement[], now: number = Date.now()): Measurement[] {
  return measurements.filter((measurement) => Date.parse(measurement.timestamp) <= now)
}