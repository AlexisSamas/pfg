import { createContext } from 'react'

export type AuthContextValue = {
  token: string | null
  isAuthenticated: boolean
  login: (accessToken: string) => void
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
