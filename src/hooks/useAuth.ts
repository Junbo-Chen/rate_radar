import { createContext, createElement, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { currentUser, login, logout, register, type LoginInput, type RegisterInput, type User } from '../api/auth'

interface AuthContextValue {
  user: User | null
  /** True zolang we nog niet weten óf er een sessie is. */
  isLoading: boolean
  signIn: (input: LoginInput) => Promise<void>
  signUp: (input: RegisterInput) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Bij het openen van de app: bestaat er nog een sessie van eerder? Het cookie
  // overleeft een herlaadbeurt, dus opnieuw inloggen hoeft dan niet.
  useEffect(() => {
    const controller = new AbortController()

    // Een afgebroken poging mag hier niets meer zetten. Zonder deze vlag maakt
    // de eerste, meteen geannuleerde aanvraag van StrictMode al "isLoading =
    // false" met "user = null": de app besluit dan dat je uitgelogd bent en
    // toont het inlogscherm, tot de echte aanvraag binnenkomt en je alsnog
    // doorspringt naar het dashboard.
    let cancelled = false

    currentUser(controller.signal)
      .then((found) => {
        if (!cancelled) setUser(found)
      })
      .catch(() => {
        if (!cancelled) setUser(null)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  // Verloopt de sessie onderweg, dan meldt de HTTP-laag dat hier. Zo hoeft niet
  // elke aanroep in de app zijn eigen 401-afhandeling te hebben.
  useEffect(() => {
    const onExpired = () => setUser(null)
    window.addEventListener('auth:unauthenticated', onExpired)
    return () => window.removeEventListener('auth:unauthenticated', onExpired)
  }, [])

  const signIn = useCallback(async (input: LoginInput) => {
    await login(input)
    setUser(await currentUser())
  }, [])

  const signUp = useCallback(async (input: RegisterInput) => {
    await register(input)
    setUser(await currentUser())
  }, [])

  const signOut = useCallback(async () => {
    try {
      await logout()
    } finally {
      // Ook als de server al niets meer van je wist: lokaal ben je uitgelogd.
      setUser(null)
    }
  }, [])

  return createElement(
    AuthContext.Provider,
    { value: { user, isLoading, signIn, signUp, signOut } },
    children,
  )
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}
