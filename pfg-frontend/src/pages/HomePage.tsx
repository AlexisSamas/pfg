import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { getStudentStatus } from '../api'
import { useAuth, useEvaluation } from '../context'
import type { LastEvaluationClaim, StudentStatusResponse } from '../types'
import { formatCountdown, parseBackendDateMs } from '../utils/time'
import {
  getAttemptContextFromToken,
  getLastEvaluationFromToken,
  getUserRoleFromToken,
} from '../utils/jwt'

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

function hasCurrentAccess(lastEvaluation: LastEvaluationClaim | null): boolean {
  return Boolean(
    lastEvaluation &&
      (lastEvaluation.decision === 'ACCESO' || lastEvaluation.manual_grant),
  )
}

function isBlockedWithoutManualGrant(
  lastEvaluation: LastEvaluationClaim | null,
): boolean {
  return Boolean(
    lastEvaluation?.decision === 'BLOQUEO' && !lastEvaluation.manual_grant,
  )
}

function hasReachedMaxAttempts(
  attemptContext: ReturnType<typeof getAttemptContextFromToken>,
): boolean {
  return Boolean(
    attemptContext &&
      attemptContext.attempt_count >= attemptContext.max_attempts,
  )
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
  const { contextId } = useEvaluation()
  const location = useLocation()
  const lastRefreshKeyRef = useRef<string | null>(null)
  const navigationState = location.state as
    | { refreshStudentStatus?: boolean }
    | null
  const refreshRequestedFromNavigation = Boolean(
    navigationState?.refreshStudentStatus,
  )
  const [focusRefreshVersion, setFocusRefreshVersion] = useState(0)
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(
    refreshRequestedFromNavigation,
  )
  const [studentStatus, setStudentStatus] =
    useState<StudentStatusResponse | null>(null)
  const hasFreshContextStatus = studentStatus?.context_id === contextId
  const tokenLastEvaluation = getLastEvaluationFromToken(token)
  const lastEvaluation =
    hasFreshContextStatus
      ? studentStatus.last_evaluation
      : tokenLastEvaluation?.context_id === contextId
        ? tokenLastEvaluation
        : null
  const tokenAttemptContext = getAttemptContextFromToken(token, contextId)
  const attemptContext = hasFreshContextStatus
    ? {
        context_id: studentStatus.context_id,
        attempt_count: studentStatus.attempt_count,
        max_attempts: studentStatus.max_attempts,
      }
    : tokenAttemptContext
  const hasManualGrant = Boolean(lastEvaluation?.manual_grant)
  const maxAttemptsReached =
    !hasManualGrant && hasReachedMaxAttempts(attemptContext)
  const userRole = getUserRoleFromToken(token) ?? 'student'
  const shouldWaitForStatusRefresh =
    isRefreshingStatus && refreshRequestedFromNavigation
  const canStartEvaluation =
    userRole === 'student' &&
    !shouldWaitForStatusRefresh &&
    !maxAttemptsReached &&
    !hasCurrentAccess(lastEvaluation) &&
    !isBlockedWithoutManualGrant(lastEvaluation)

  useEffect(() => {
    function refreshOnFocus() {
      setFocusRefreshVersion((currentVersion) => currentVersion + 1)
    }

    window.addEventListener('focus', refreshOnFocus)

    return () => {
      window.removeEventListener('focus', refreshOnFocus)
    }
  }, [])

  useEffect(() => {
    const refreshKey = `${location.key}:${contextId}:${focusRefreshVersion}`

    if (!token || userRole !== 'student' || lastRefreshKeyRef.current === refreshKey) {
      return
    }

    let isActive = true
    lastRefreshKeyRef.current = refreshKey
    setIsRefreshingStatus(true)

    async function refreshUserStatus() {
      try {
        const response = await getStudentStatus(contextId)
        if (isActive) {
          setStudentStatus(response)
        }
      } catch {
        // Si falla el refresh, Home conserva el token actual y el backend sigue
        // validando el límite al crear sesión.
      } finally {
        if (isActive) {
          setIsRefreshingStatus(false)
        }
      }
    }

    void refreshUserStatus()

    return () => {
      isActive = false
    }
  }, [contextId, focusRefreshVersion, location.key, token, userRole])

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
        <LastEvaluationSummary
          lastEvaluation={lastEvaluation}
          maxAttemptsReached={maxAttemptsReached}
        />
      )}

      <div className="page-actions">
        {canStartEvaluation && (
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
  maxAttemptsReached,
}: {
  lastEvaluation: LastEvaluationClaim | null
  maxAttemptsReached: boolean
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

  if (lastEvaluation?.manual_grant) {
    return (
      <div className="page-status" role="status">
        <p>Un docente te ha concedido acceso manual.</p>
        <p>Estado actual: ACCESO.</p>
      </div>
    )
  }

  if (maxAttemptsReached) {
    return (
      <div className="page-status" role="status">
        <p>
          Has alcanzado el número máximo de intentos para este contexto.
        </p>
        <p>Contacta con un docente si necesitas acceso manual.</p>
      </div>
    )
  }

  if (!lastEvaluation) {
    return (
      <p className="page-status">
        Todavía no tienes evaluaciones registradas para este contexto.
      </p>
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
