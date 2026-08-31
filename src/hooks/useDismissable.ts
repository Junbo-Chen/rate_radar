import { useEffect, type RefObject } from 'react'

interface Options {
  isOpen: boolean
  /** Sluit het paneel. Geef een stabiele functie mee (useCallback). */
  onDismiss: () => void
  /** Alles binnen dit element telt als "erin geklikt". */
  containerRef: RefObject<HTMLElement | null>
  /** De knop die het paneel opende; krijgt na Escape de focus terug. */
  triggerRef?: RefObject<HTMLElement | null>
}

/**
 * Sluit een uitklappaneel bij een klik erbuiten of op Escape.
 *
 * Na Escape gaat de focus terug naar de knop die het opende, zodat je niet met
 * de tab-toets hoeft te zoeken waar je gebleven was. Dit gedrag stond eerst
 * alleen in UserMenu; de Toolbar heeft nu hetzelfde nodig, en twee kopieën van
 * dezelfde luisteraars lopen vroeg of laat uit elkaar.
 */
export function useDismissable({ isOpen, onDismiss, containerRef, triggerRef }: Options): void {
  useEffect(() => {
    if (!isOpen) return

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) onDismiss()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      onDismiss()
      triggerRef?.current?.focus()
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen, onDismiss, containerRef, triggerRef])
}
