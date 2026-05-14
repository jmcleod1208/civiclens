import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { type AuthUser, getToken, clearToken } from './api'

interface AuthContextValue {
  user: AuthUser | null
  setUser: (u: AuthUser | null) => void
  logout: () => void
  isLoading: boolean
  hasAccess: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (token) {
      try {
        // Decode the JWT payload (no verification — server verifies on each request)
        const payload = JSON.parse(atob(token.split('.')[1]))
        if (payload.exp * 1000 > Date.now()) {
          // Restore minimal user from token claims — full profile fetched on demand
          setUser({
            id: payload.sub,
            email: payload.email,
            subscriptionStatus: 'trial',
            trialStartedAt: null,
          })
        } else {
          clearToken()
        }
      } catch {
        clearToken()
      }
    }
    setIsLoading(false)
  }, [])

  function logout() {
    clearToken()
    setUser(null)
  }

  const TRIAL_MS = 7 * 24 * 60 * 60 * 1000
  const hasAccess =
    user?.subscriptionStatus === 'active' ||
    (user?.subscriptionStatus === 'trial' &&
      !!user.trialStartedAt &&
      Date.now() - new Date(user.trialStartedAt).getTime() < TRIAL_MS)

  return (
    <AuthContext.Provider value={{ user, setUser, logout, isLoading, hasAccess }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
