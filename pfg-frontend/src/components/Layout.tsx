import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context'
import { getUserRoleFromToken } from '../utils/jwt'
import './Layout.css'

export function Layout() {
  const { logout, token } = useAuth()
  const navigate = useNavigate()
  const userRole = getUserRoleFromToken(token) ?? 'student'

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-layout">
      <header className="app-header">
        <Link className="app-title" to="/">
          Sistema de Evaluación Cognitiva
        </Link>
        <nav className="app-nav" aria-label="Navegación principal">
          {userRole === 'student' && <Link to="/evaluation">Evaluación</Link>}
          {userRole === 'instructor' && (
            <Link to="/dashboard">Dashboard docente</Link>
          )}
          <button type="button" className="logout-button" onClick={handleLogout}>
            Cerrar sesión
          </button>
        </nav>
      </header>

      <main className="layout-main">
        <Outlet />
      </main>
    </div>
  )
}
