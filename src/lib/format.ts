import type { TimeZoneMode } from "../hooks/useTimezone";

/**
 * Lightspeed-timestamps komen binnen als ISO-8601 in UTC (Z-suffix).
 *
 * Zonder `timeZone: "UTC"` toont Intl.DateTimeFormat ze in de lokale zone van
 * de browser. In CEST (UTC+2) werd 15:59:55Z daardoor 17:59:55 — alsof er
 * extra metingen na de laatste timestamp stonden.
 */
function zoneOf(mode: TimeZoneMode): string | undefined {
  return mode === "utc" ? "UTC" : undefined;
}

function timeFormatter(mode: TimeZoneMode, withSeconds: boolean) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" as const } : {}),
    hourCycle: "h23",
    timeZone: zoneOf(mode),
  });
}

export const formatTime = (iso: string, mode: TimeZoneMode) =>
  timeFormatter(mode, false).format(new Date(iso));

/** Dag + maand, voor assen die meer dan een etmaal beslaan — daar is een
 *  kloktijd dubbelzinnig omdat elk uur zich herhaalt. */
export const formatDay = (iso: string, mode: TimeZoneMode) =>
  new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
    timeZone: zoneOf(mode),
  }).format(new Date(iso));

export const formatTimeExact = (iso: string, mode: TimeZoneMode) =>
  timeFormatter(mode, true).format(new Date(iso));

export function formatDateTime(iso: string, mode: TimeZoneMode): string {
  const date = new Date(iso);
  const datePart = new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
    timeZone: zoneOf(mode),
  }).format(date);
  const timePart = timeFormatter(mode, true).format(date);
  return mode === "utc" ? `${datePart} ${timePart} UTC` : `${datePart} ${timePart}`;
}

const NUMBER = new Intl.NumberFormat("nl-NL");

export const formatNumber = (value: number) => NUMBER.format(value);

/** 0.8342 -> "83%". Afgerond naar beneden, zodat 99,7% nooit "100%" toont. */
export function formatPercent(ratio: number): string {
  return `${Math.min(999, Math.floor(ratio * 100))}%`;
}

export function formatRelative(iso: string, now: number = Date.now()): string {
  const seconds = Math.round((now - Date.parse(iso)) / 1000);
  if (seconds < 0) return "zojuist";
  if (seconds < 60) return `${seconds} sec geleden`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min geleden`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} uur geleden`;
  return `${Math.round(hours / 24)} dag(en) geleden`;
}

/**
 * Benoemt de zone waarin de tijden staan. Bij lokale tijd staat de offset
 * erbij, want de bron levert UTC — dat verschil moet je weten zodra je een
 * tijdstip naast de database van de back-end legt.
 */
export function zoneCaption(mode: TimeZoneMode): string {
  if (mode === "utc") return "tijden in UTC";

  const offsetMinutes = -new Date().getTimezoneOffset();
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  const offset = minutes === 0 ? `${hours}` : `${hours}:${String(minutes).padStart(2, "0")}`;

  return `tijden in lokale tijd (UTC${sign}${offset})`;
}