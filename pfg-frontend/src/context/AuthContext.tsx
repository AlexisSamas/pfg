import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { API_TOKEN_STORAGE_KEY } from '../api'
import { AuthContext, type AuthContextValue } from './auth-context'

type AuthProviderProps = {
  children: ReactNode
}

function readStoredToken(): string | null {
  return localStorage.getItem(API_TOKEN_STORAGE_KEY)
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [token, setToken] = useState<string | null>(() => readStoredToken())

  const login = useCallback((accessToken: string) => {
    localStorage.setItem(API_TOKEN_STORAGE_KEY, accessToken)
    setToken(accessToken)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(API_TOKEN_STORAGE_KEY)
    setToken(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      isAuthenticated: token !== null,
      login,
      logout,
    }),
    [login, logout, token],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
