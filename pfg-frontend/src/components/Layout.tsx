import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth, useEvaluation, type CurrentGame } from '../context'
import { getUserRoleFromToken } from '../utils/jwt'
import { FlowProgress, type FlowStep } from './FlowProgress'
import './Layout.css'

export function Layout() {
  const { logout, token } = useAuth()
  const { clearEvaluation, currentGame } = useEvaluation()
  const location = useLocation()
  const navigate = useNavigate()
  const userRole = getUserRoleFromToken(token) ?? 'student'
  const currentStep = getHeaderFlowStep(location.pathname, currentGame)

  function handleLogout() {
    clearEvaluation()
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-layout">
      <header className="app-header">
        <Link className="app-title" to="/">
          Monitorización cognitiva
        </Link>
        <div className="app-header-progress">
          <FlowProgress
            className="flow-progress--header"
            currentStep={currentStep}
          />
        </div>
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

function getHeaderFlowStep(
  pathname: string,
  currentGame: CurrentGame,
): FlowStep {
  if (pathname.startsWith('/result')) {
    return 'result'
  }

  if (pathname.startsWith('/evaluation')) {
    if (currentGame === 'completed') {
      return 'result'
    }

    return currentGame ?? 'session'
  }

  return 'session'
}
