import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context'
import type { LastEvaluationClaim } from '../types'
import { formatCountdown, parseBackendDateMs } from '../utils/time'
import { getLastEvaluationFromToken, getUserRoleFromToken } from '../utils/jwt'

function formatScore(score: number | null): string {
  return score === null ? 'no disponible' : `${score.toFixed(1)}/100`
}

function getRemainingMs(waitUntil: string | null, now: number): number | null {
  if (!waitUntil) {
    return null
  }

  const waitUntilMs = parseBackendDateMs(waitUntil)

  if (Number.isNaN(waitUntilMs)) {
    return null
  }

  return Math.max(waitUntilMs - now, 0)
}

function WaitUnavailableMessage() {
  return (
    <p>
      No se ha podido recuperar el tiempo de espera. Cierra sesión y vuelve a
      entrar o actualiza la página.
    </p>
  )
}

export function HomePage() {
  const { token } = useAuth()
  const lastEvaluation = getLastEvaluationFromToken(token)
  const userRole = getUserRoleFromToken(token) ?? 'student'

  return (
    <section className="page-panel home-page" aria-labelledby="home-title">
      <h1
        aria-label="Sistema de monitorización cognitiva"
        id="home-title"
      >
        Sistema de
        <br />
        monitorización cognitiva
      </h1>
      <p className="description">
        Aplicación web para evaluar el rendimiento cognitivo mediante
        <br />
        juegos serios y mostrar retroalimentación al usuario.
      </p>

      {userRole === 'student' && (
        <LastEvaluationSummary lastEvaluation={lastEvaluation} />
      )}

      <div className="page-actions">
        {userRole === 'student' && (
          <Link className="primary-link" to="/evaluation">
            Iniciar evaluación
          </Link>
        )}
        {userRole === 'instructor' && (
          <Link className="primary-link" to="/dashboard">
            Dashboard docente
          </Link>
        )}
      </div>
    </section>
  )
}

function LastEvaluationSummary({
  lastEvaluation,
}: {
  lastEvaluation: LastEvaluationClaim | null
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (lastEvaluation?.decision !== 'ESPERA' || !lastEvaluation.wait_until) {
      return
    }

    const intervalId = window.setInterval(() => {
      setNow(Date.now())
    }, 1_000)

    return () => window.clearInterval(intervalId)
  }, [lastEvaluation?.decision, lastEvaluation?.wait_until])

  if (!lastEvaluation) {
    return (
      <p className="page-status">Todavía no tienes evaluaciones registradas.</p>
    )
  }

  if (lastEvaluation.manual_grant) {
    return (
      <div className="page-status" role="status">
        <p>Un docente te ha concedido acceso manual.</p>
        <p>Estado actual: ACCESO.</p>
      </div>
    )
  }

  if (lastEvaluation.decision === 'ACCESO') {
    return (
      <div className="page-status" role="status">
        <p>Tu última puntuación fue {formatScore(lastEvaluation.score)}.</p>
        <p>Has superado la evaluación. No es necesario repetirla.</p>
      </div>
    )
  }

  if (lastEvaluation.decision === 'BLOQUEO') {
    return (
      <div className="page-status" role="status">
        <p>Tu última puntuación fue {formatScore(lastEvaluation.score)}.</p>
        <p>
          Estás en estado de bloqueo. Contacta con un docente para solicitar
          acceso manual.
        </p>
      </div>
    )
  }

  const remainingMs = getRemainingMs(lastEvaluation.wait_until, now)

  return (
    <div className="page-status" role="status">
      <p>Tu última puntuación fue {formatScore(lastEvaluation.score)}.</p>
      <p>Estás en estado de espera.</p>
      {remainingMs === null ? (
        <WaitUnavailableMessage />
      ) : remainingMs === 0 ? (
        <p>Ya ha finalizado tu tiempo de espera. Puedes reintentar la evaluación.</p>
      ) : (
        <p>
          Puedes reintentarlo cuando finalice el tiempo de espera:{' '}
          {formatCountdown(remainingMs)}
        </p>
      )}
    </div>
  )
}
