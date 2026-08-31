import { useCallback, useMemo, useState } from 'react'
import { playChime, primeChime } from '../lib/chime'

/**
 * Systeemmeldingen bij een 429.
 *
 * De toasts op het dashboard werken alleen zolang je ernaar kijkt. Wie het
 * tabblad op de achtergrond heeft staan mist een limiethit volledig, en juist
 * dan wil je het weten. Deze hook vult dat gat met een browsermelding plus een
 * optioneel piepje.
 */

const STORAGE_KEY = 'rateradar:notifications'

/** Eén tag voor alle 429-meldingen: een nieuwe vervangt de vorige in plaats van
 *  het meldingencentrum vol te stapelen. */
const TAG = 'rateradar-429'

export interface NotificationPreferences {
  enabled: boolean
  sound: boolean
}

const DEFAULTS: NotificationPreferences = { enabled: false, sound: true }

/** 'unsupported' als de browser de Notification API niet kent (iOS Safari
 *  buiten een ge\u00efnstalleerde PWA, bijvoorbeeld). */
export type PermissionState = NotificationPermission | 'unsupported'

function isSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

function readStored(): NotificationPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed === 'object' && parsed !== null) {
        const record = parsed as Record<string, unknown>
        return {
          enabled: typeof record.enabled === 'boolean' ? record.enabled : DEFAULTS.enabled,
          sound: typeof record.sound === 'boolean' ? record.sound : DEFAULTS.sound,
        }
      }
    }
  } catch {
    // Priv\u00e9modus, geblokkeerde opslag of onleesbare JSON: dan de standaard.
  }
  return DEFAULTS
}

function store(preferences: NotificationPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
  } catch {
    // Niet kunnen onthouden is geen reden om de melding niet te sturen.
  }
}

function initialPermission(): PermissionState {
  return isSupported() ? Notification.permission : 'unsupported'
}

/**
 * Toont \u00e9\u00e9n melding. Faalt stil: een geweigerde of onmogelijke melding mag
 * het dashboard nooit onderuithalen.
 */
function show(title: string, body: string): void {
  try {
    const notification = new Notification(title, {
      body,
      // Eén tag betekent: een nieuwe hit vervangt de vorige melding in plaats
      // van het meldingencentrum vol te stapelen. `renotify` zou hem opnieuw
      // laten attenderen, maar dat veld geldt alleen voor service-worker-
      // meldingen en hoort niet bij deze constructor.
      tag: TAG,
      icon: '/favicon.svg',
    })

    // Klikken brengt je terug naar het dashboard in plaats van naar een leeg
    // tabblad.
    notification.onclick = () => {
      window.focus()
      notification.close()
    }
  } catch {
    // Android Chrome staat de constructor niet toe en eist een service worker.
    // Daar blijft het bij de toast en het geluid.
  }
}

export interface NotificationsState extends NotificationPreferences {
  supported: boolean
  permission: PermissionState
  /** Zet meldingen aan of uit; vraagt zo nodig eerst toestemming. */
  toggle: () => Promise<void>
  setSound: (sound: boolean) => void
  /** Meld een nieuwe 429. Doet niets als meldingen uitstaan. */
  notify: (title: string, body: string) => void
}

export function useNotifications(): NotificationsState {
  const [preferences, setPreferences] = useState<NotificationPreferences>(readStored)
  const [permission, setPermission] = useState<PermissionState>(initialPermission)

  const update = useCallback((next: NotificationPreferences) => {
    setPreferences(next)
    store(next)
  }, [])

  const toggle = useCallback(async () => {
    if (preferences.enabled) {
      update({ ...preferences, enabled: false })
      return
    }

    // Deze aanroep zit in de klikafhandeling, en dat is precies waar browsers
    // een toestemmingsvraag toestaan.
    let granted = permission === 'granted'

    if (isSupported() && permission === 'default') {
      const result = await Notification.requestPermission()
      setPermission(result)
      granted = result === 'granted'
    }

    if (!granted) return

    // Nog binnen het gebruikersgebaar: hierna mag het geluid spelen.
    if (preferences.sound) primeChime()

    update({ ...preferences, enabled: true })

    // Meteen \u00e9\u00e9n melding, zodat je ziet d\u00e1t het werkt. Anders moet je op een
    // echte 429 wachten om te weten of de schakelaar iets deed.
    show('Meldingen staan aan', 'RateRadar waarschuwt je voortaan bij een 429.')
  }, [preferences, permission, update])

  const setSound = useCallback(
    (sound: boolean) => {
      // Meteen laten horen wat je aanzet. Anders moet je op een echte 429
      // wachten om te weten of het geluid het doet.
      if (sound) {
        primeChime()
        playChime()
      }
      update({ ...preferences, sound })
    },
    [preferences, update],
  )

  const notify = useCallback(
    (title: string, body: string) => {
      if (!preferences.enabled) return

      // Het geluid speelt ook als je kijkt: het trekt je blik naar de toast.
      if (preferences.sound) playChime()

      // Kijk je al naar het dashboard, dan is de toast genoeg en zou een
      // systeemmelding dubbelop zijn.
      if (document.visibilityState === 'visible') return
      if (!isSupported() || Notification.permission !== 'granted') return

      show(title, body)
    },
    [preferences.enabled, preferences.sound],
  )

  // Zonder memo levert elke render een nieuw object op. Het effect dat de
  // 429-meldingen verstuurt heeft deze waarde in zijn dependencies staan, en
  // zou dan bij iedere render opnieuw draaien — net als de Toolbar eronder.
  return useMemo(
    () => ({
      ...preferences,
      supported: isSupported(),
      permission,
      toggle,
      setSound,
      notify,
    }),
    [preferences, permission, toggle, setSound, notify],
  )
}
