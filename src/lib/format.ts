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

/**
 * Sleutel van de kalenderdag waarin dit tijdstip valt, in de getoonde zone.
 * Vorm `2026-08-26`, zodat sorteren op tekst gelijk is aan sorteren op tijd.
 */
export function dayKey(iso: string, mode: TimeZoneMode): string {
  const date = new Date(iso);
  if (mode === "utc") return date.toISOString().slice(0, 10);

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * "wo 26 aug" uit een sleutel als `2026-08-26`.
 *
 * De sleutel wordt als middag gelezen, niet als middernacht: dat voorkomt dat
 * een zone-omrekening hem net over de grens naar de vorige of volgende dag tilt.
 */
export function formatDayKey(key: string, mode: TimeZoneMode): string {
  const [year, month, day] = key.split("-").map(Number);
  const at =
    mode === "utc"
      ? Date.UTC(year, month - 1, day, 12)
      : new Date(year, month - 1, day, 12).getTime();

  return new Intl.DateTimeFormat("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: zoneOf(mode),
  }).format(at);
}

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
/**
 * `2026-08-28T14:30` voor een `<input type="datetime-local">`, in de zone die
 * het dashboard toont. Zo'n veld kent zelf geen zone: het toont precies de
 * cijfers die je erin zet, dus die moeten hier al kloppen.
 */
export function toDateTimeInput(ms: number, mode: TimeZoneMode): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");

  if (mode === "utc") {
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
      date.getUTCDate(),
    )}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Omgekeerde van toDateTimeInput. NaN zolang het veld nog onvolledig is. */
export function fromDateTimeInput(value: string, mode: TimeZoneMode): number {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (parts === null) return Number.NaN;

  const [year, month, day, hour, minute] = parts.slice(1).map(Number);

  return mode === "utc"
    ? Date.UTC(year, month - 1, day, hour, minute)
    : new Date(year, month - 1, day, hour, minute).getTime();
}
