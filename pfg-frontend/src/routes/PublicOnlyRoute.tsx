import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context'

export function PublicOnlyRoute() {
  const { isAuthenticated } = useAuth()

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
