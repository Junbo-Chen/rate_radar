import { useCallback, useEffect, useState } from 'react'
import { driverFor, type Credential, type CredentialInput } from '../api/credentials'

export function useCredentials(useLive: boolean) {
  const [items, setItems] = useState<Credential[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const driver = driverFor(useLive)

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    driverFor(useLive)
      .list(controller.signal)
      .then((rows) => {
        if (!cancelled) {
          setItems(rows)
          setError(null)
        }
      })
      .catch((cause: unknown) => {
        if (cancelled || (cause instanceof DOMException && cause.name === 'AbortError')) return
        setError(cause instanceof Error ? cause.message : 'Kon de credentials niet laden.')
        setItems([])
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [useLive])

  /** Voert een schrijfactie uit en zet de lijst opnieuw. */
  const run = useCallback(async (action: () => Promise<void>) => {
    setIsSaving(true)
    try {
      await action()
      setError(null)
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'De actie is niet gelukt.')
      return false
    } finally {
      setIsSaving(false)
    }
  }, [])

  const create = useCallback(
    (input: CredentialInput) =>
      run(async () => {
        const row = await driver.create(input)
        setItems((current) => [...current, row])
      }),
    [driver, run],
  )

  const update = useCallback(
    (id: string, input: CredentialInput) =>
      run(async () => {
        const row = await driver.update(id, input)
        setItems((current) => current.map((item) => (item.id === id ? row : item)))
      }),
    [driver, run],
  )

  const remove = useCallback(
    (id: string) =>
      run(async () => {
        await driver.remove(id)
        setItems((current) => current.filter((item) => item.id !== id))
      }),
    [driver, run],
  )

  return { items, isLoading, isSaving, error, create, update, remove }
}
