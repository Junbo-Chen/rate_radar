import type { LimitReading } from '../api/contract'

/**
 * Drie niveaus, bewust niet meer. Een vierde tint (geel naast oranje) is voor
 * veel lezers niet te onderscheiden, dus die stap is eruit gelaten.
 * Kleur draagt de betekenis nooit alleen: elk niveau heeft ook een eigen
 * icoonvorm en een tekstlabel.
 */
export type Status = 'ok' | 'warning' | 'critical'

/** Boven dit percentage kleurt de indicator oranje. */
export const WARNING_THRESHOLD = 0.8

export const STATUS_LABELS: Record<Status, string> = {
  ok: 'Veilig',
  warning: 'Bijna vol',
  critical: 'Limiet geraakt',
}

export function usageRatio(reading: LimitReading): number {
  if (reading.limit <= 0) return 0
  return reading.used / reading.limit
}

export function statusOf(reading: LimitReading): Status {
  if (reading.hit_429 || usageRatio(reading) >= 1) return 'critical'
  if (usageRatio(reading) >= WARNING_THRESHOLD) return 'warning'
  return 'ok'
}

/** De zwaarste status wint, zodat een kop-indicator nooit te optimistisch is. */
export function worstStatus(statuses: Status[]): Status {
  if (statuses.includes('critical')) return 'critical'
  if (statuses.includes('warning')) return 'warning'
  return 'ok'
}
