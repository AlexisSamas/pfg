import { Navigate, useLocation } from 'react-router-dom'
import { Layout } from '../components'
import { useAuth } from '../context'

export function ProtectedRoute() {
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Layout />
}
