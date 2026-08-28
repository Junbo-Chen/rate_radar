import { useCallback, useEffect, useRef, useState } from 'react'
import type { Status } from '../lib/status'

export interface Toast {
  id: string
  title: string
  body: string
  status: Status
}

/** Een 429 is het bekijken waard, dus geven we er ruim de tijd voor. */
const AUTO_DISMISS_MS = 8000

/** Meer dan dit tegelijk wordt een muur in plaats van een melding. */
const MAX_VISIBLE = 4

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<string, number>())

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))

    const timer = timers.current.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = crypto.randomUUID()
      setToasts((current) => [...current, { ...toast, id }].slice(-MAX_VISIBLE))

      timers.current.set(id, window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS))
    },
    [dismiss],
  )

  // Losse timers zouden na het verlaten van de pagina nog willen opruimen.
  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) clearTimeout(timer)
      pending.clear()
    }
  }, [])

  return { toasts, push, dismiss }
}
