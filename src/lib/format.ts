const TIME = new Intl.DateTimeFormat('nl-NL', {
  hour: '2-digit',
  minute: '2-digit',
})

const TIME_WITH_SECONDS = new Intl.DateTimeFormat('nl-NL', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

const DATE_TIME = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

const NUMBER = new Intl.NumberFormat('nl-NL')

export const formatTime = (iso: string) => TIME.format(new Date(iso))
export const formatTimeExact = (iso: string) => TIME_WITH_SECONDS.format(new Date(iso))
export const formatDateTime = (iso: string) => DATE_TIME.format(new Date(iso))
export const formatNumber = (value: number) => NUMBER.format(value)

/** 0.8342 -> "83%". Afgerond naar beneden, zodat 99,7% nooit "100%" toont. */
export function formatPercent(ratio: number): string {
  return `${Math.min(999, Math.floor(ratio * 100))}%`
}

/** "3 minuten geleden" — voor de versheid van de laatste meting. */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const seconds = Math.round((now - Date.parse(iso)) / 1000)
  if (seconds < 0) return 'zojuist'
  if (seconds < 60) return `${seconds} sec geleden`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min geleden`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} uur geleden`
  return `${Math.round(hours / 24)} dag(en) geleden`
}
