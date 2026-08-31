/**
 * Een kort tweetonig piepje via de Web Audio API.
 *
 * Bewust geen mp3-bestand: dat scheelt een asset, een netwerkverzoek en gedoe
 * met caching, en een attentiesignaal hoeft niet meer te zijn dan dit.
 *
 * De AudioContext wordt pas bij het eerste gebruik gemaakt en daarna hergebruikt.
 * Browsers leveren hem geschorst op tot er een gebruikersgebaar is geweest —
 * daarom `primeChime`, die we aanroepen op het moment dat de schakelaar omgaat.
 */

type AudioContextCtor = typeof AudioContext

let context: AudioContext | null = null

function resolveCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const scope = window as typeof window & { webkitAudioContext?: AudioContextCtor }
  return scope.AudioContext ?? scope.webkitAudioContext ?? null
}

function audioContext(): AudioContext | null {
  if (context) return context

  const Ctor = resolveCtor()
  if (!Ctor) return null

  try {
    context = new Ctor()
  } catch {
    // Sommige browsers weigeren een context zonder gebruikersgebaar. Dan blijft
    // het bij de melding zonder geluid.
    return null
  }
  return context
}

/**
 * Maakt de context alvast aan tijdens een klik. Zonder dit blijft het eerste
 * piepje stil, omdat de context dan pas ontstaat op een moment dat de browser
 * niet meer als gebruikersgebaar telt.
 */
export function primeChime(): void {
  const ctx = audioContext()
  if (ctx && ctx.state === 'suspended') void ctx.resume()
}

export function playChime(): void {
  const ctx = audioContext()
  if (!ctx) return

  // Een tab die op de achtergrond stond kan de context geschorst hebben.
  if (ctx.state === 'suspended') void ctx.resume()

  const now = ctx.currentTime

  // Twee dalende tonen: valt op zonder scherp of alarmerend te klinken.
  ;[880, 660].forEach((frequency, index) => {
    const start = now + index * 0.12
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.value = frequency

    // Recht aan- en uitzetten geeft een hoorbare klik; dit is een korte fade.
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11)

    oscillator.connect(gain).connect(ctx.destination)
    oscillator.start(start)
    oscillator.stop(start + 0.13)
  })
}
