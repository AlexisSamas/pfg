import { useEffect, useState } from 'react'
import axios from 'axios'
import { Link, useNavigate } from 'react-router-dom'
import { getResult, getWait } from '../api'
import { parseApiError } from '../api/errorHandling'
import { useAuth, useEvaluation } from '../context'
import type { Decision, WaitResponse } from '../types'
import { getRecommendationMessage } from '../utils/recommendationMessages'
import { formatCountdown, parseBackendDateMs } from '../utils/time'
import './ResultPage.css'

const decisionMessages: Record<Decision, string> = {
  ACCESO: 'Puedes continuar con el proceso. La evaluación cumple los criterios de acceso.',
  ESPERA:
    'Debes esperar antes de reintentar la evaluación. Vuelve cuando termine el periodo de espera indicado por el sistema.',
  BLOQUEO:
    'No puedes continuar por ahora. Contacta con el docente para revisar tu situación.',
}

const RESULT_POLL_INTERVAL_MS = 1_000
const RESULT_POLL_MAX_ATTEMPTS = 30

function formatScore(score: number | null): string {
  return score === null ? 'No recibido' : score.toFixed(2)
}

type WaitRequestStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'missing-session'
  | 'not-found'
  | 'error'

type ResultRequestStatus = 'idle' | 'loading' | 'success' | 'missing-session' | 'error'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export function ResultPage() {
  const {
    result,
    sessionId,
    waitInfo,
    setResult,
    setWaitInfo,
    clearEvaluation,
  } = useEvaluation()
  const { login: updateToken } = useAuth()
  const navigate = useNavigate()
  const [resultStatus, setResultStatus] = useState<ResultRequestStatus>(
    result ? 'success' : 'idle',
  )
  const [resultError, setResultError] = useState<string | null>(null)
  const [resultRetryCount, setResultRetryCount] = useState(0)
  const [waitStatus, setWaitStatus] = useState<WaitRequestStatus>('idle')
  const [waitError, setWaitError] = useState<string | null>(null)
  const remainingWaitMs = useWaitCountdown(
    result?.decision === 'ESPERA' ? waitInfo?.wait_until : null,
  )

  useEffect(() => {
    function handleBrowserBack() {
      navigate('/', { replace: true })
    }

    window.addEventListener('popstate', handleBrowserBack)

    return () => {
      window.removeEventListener('popstate', handleBrowserBack)
    }
  }, [navigate])

  useEffect(() => {
    if (result) {
      return
    }

    if (!sessionId) {
      return
    }

    let isActive = true
    const activeSessionId = sessionId

    async function fetchResultWithPolling() {
      setResultStatus('loading')
      setResultError(null)

      for (let attempt = 1; attempt <= RESULT_POLL_MAX_ATTEMPTS; attempt += 1) {
        try {
          const resultResponse = await getResult(activeSessionId)

          if (!isActive) {
            return
          }

          setResult(resultResponse)
          if (resultResponse.new_access_token) {
            updateToken(resultResponse.new_access_token)
          }
          setResultStatus('success')
          return
        } catch (requestError) {
          if (!isActive) {
            return
          }

          const isResultPending =
            axios.isAxiosError(requestError) &&
            requestError.response?.status === 425

          if (
            isResultPending &&
            attempt < RESULT_POLL_MAX_ATTEMPTS
          ) {
            await delay(RESULT_POLL_INTERVAL_MS)
            continue
          }

          setResultStatus('error')
          setResultError(parseApiError(requestError).message)
          return
        }
      }
    }

    void fetchResultWithPolling()

    return () => {
      isActive = false
    }
  }, [result, resultRetryCount, sessionId, setResult, updateToken])

  useEffect(() => {
    if (result?.decision !== 'ESPERA') {
      return
    }

    if (!sessionId) {
      return
    }

    let isActive = true
    const activeSessionId = sessionId

    async function fetchWaitInfo() {
      setWaitStatus('loading')
      setWaitError(null)

      try {
        const waitResponse = await getWait(activeSessionId)

        if (!isActive) {
          return
        }

        setWaitInfo(waitResponse)
        setWaitStatus('success')
      } catch (requestError) {
        if (!isActive) {
          return
        }

        if (
          axios.isAxiosError(requestError) &&
          requestError.response?.status === 404
        ) {
          setWaitInfo(null)
          setWaitStatus('not-found')
        } else {
          setWaitStatus('error')
          setWaitError(parseApiError(requestError).message)
        }
      }
    }

    void fetchWaitInfo()

    return () => {
      isActive = false
    }
  }, [result?.decision, sessionId, setWaitInfo])

  function handleRetryEvaluation() {
    clearEvaluation()
    navigate('/evaluation')
  }

  function handleRetryResultLoad() {
    setResultStatus('idle')
    setResultError(null)
    setResultRetryCount((currentCount) => currentCount + 1)
  }

  const waitPanelStatus =
    result?.decision === 'ESPERA' && !sessionId
      ? 'missing-session'
      : waitStatus
  const effectiveResultStatus =
    !result && !sessionId ? 'missing-session' : resultStatus
  const shouldShowRecommendation = result?.decision !== 'ACCESO'

  return (
    <section className="page-panel result-page" aria-labelledby="result-title">
      <p className="eyebrow">Resultado</p>
      <h1 id="result-title">Resultado de la evaluación</h1>

      {result ? (
        <>
          <div
            className={`result-summary result-summary--${result.decision.toLowerCase()}`}
          >
            <p className="result-decision">
              {result.decision}
              <span aria-hidden="true"> · </span>
              <span>Score: {formatScore(result.score)}</span>
              {result.decision === 'ESPERA' && remainingWaitMs !== null && (
                <>
                  <span aria-hidden="true"> · </span>
                  <span>Tiempo: {formatCountdown(remainingWaitMs)}</span>
                </>
              )}
            </p>
            <p className="result-message">
              {decisionMessages[result.decision]}
            </p>
          </div>
          {shouldShowRecommendation && (
            <dl
              className="result-details result-details--single"
              aria-label="Detalle del resultado"
            >
              <div className="result-recommendation-card">
                <dt>Recomendación</dt>
                <dd>{getRecommendationMessage(result.recommendation_key)}</dd>
              </div>
            </dl>
          )}
          {result.decision === 'ESPERA' && (
            <WaitInfoPanel
              onRetry={handleRetryEvaluation}
              status={waitPanelStatus}
              waitError={waitError}
              waitInfo={waitInfo}
              remainingMs={remainingWaitMs}
            />
          )}
        </>
      ) : (
        <ResultLoadingPanel
          error={resultError}
          status={effectiveResultStatus}
          onRetry={handleRetryResultLoad}
        />
      )}
    </section>
  )
}

function ResultLoadingPanel({
  error,
  status,
  onRetry,
}: {
  error: string | null
  status: ResultRequestStatus
  onRetry: () => void
}) {
  if (status === 'loading' || status === 'idle') {
    return (
      <>
        <p className="description">
          Estamos obteniendo el resultado final de esta evaluación.
        </p>
        <p className="page-status" aria-live="polite">
          Datos recibidos. Obteniendo resultado final...
        </p>
      </>
    )
  }

  if (status === 'missing-session') {
    return (
      <>
        <p className="description">
          Todavía no hay resultado guardado para esta evaluación.
        </p>
        <p className="page-status">
          No se puede recuperar el resultado porque no existe una sesión activa.
        </p>
        <div className="page-actions">
          <Link className="primary-link" to="/evaluation">
            Volver a la evaluación
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      <p className="description">
        No se ha podido recuperar el resultado final automáticamente.
      </p>
      <p className="form-message error-message" role="alert">
        {error}
      </p>
      <div className="page-actions">
        <button type="button" className="primary-action" onClick={onRetry}>
          Reintentar obtener resultado
        </button>
      </div>
    </>
  )
}

function WaitInfoPanel({
  onRetry,
  remainingMs,
  status,
  waitError,
  waitInfo,
}: {
  onRetry: () => void
  remainingMs: number | null
  status: WaitRequestStatus
  waitError: string | null
  waitInfo: WaitResponse | null
}) {
  if (status === 'loading') {
    return (
      <p className="page-status" aria-live="polite">
        Consultando periodo de espera...
      </p>
    )
  }

  if (status === 'missing-session') {
    return (
      <p className="form-message error-message result-wait-message" role="alert">
        No se puede consultar la espera porque no existe una sesión activa.
        Vuelve a iniciar la evaluación para crear una nueva sesión.
      </p>
    )
  }

  if (status === 'not-found') {
    return (
      <p className="page-status">
        No hay un periodo de espera asociado a esta sesión. No se ha devuelto
        información adicional de espera.
      </p>
    )
  }

  if (status === 'error') {
    return (
      <p className="form-message error-message result-wait-message" role="alert">
        {waitError}
      </p>
    )
  }

  if (status !== 'success' || !waitInfo) {
    return null
  }

  const canRetry = remainingMs === 0

  if (!canRetry) {
    return null
  }

  return (
    <section className="result-wait" aria-label="Acciones de espera">
      <button
        type="button"
        className="result-retry-button"
        onClick={onRetry}
      >
        Reintentar evaluación
      </button>
    </section>
  )
}

function useWaitCountdown(waitUntil: string | null | undefined): number | null {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!waitUntil) {
      return
    }

    const intervalId = window.setInterval(() => {
      setNow(Date.now())
    }, 1_000)

    return () => window.clearInterval(intervalId)
  }, [waitUntil])

  return getRemainingWaitMs(waitUntil, now)
}

function getRemainingWaitMs(
  waitUntil: string | null | undefined,
  now: number,
): number | null {
  if (!waitUntil) {
    return null
  }

  const waitUntilMs = parseBackendDateMs(waitUntil)

  if (Number.isNaN(waitUntilMs)) {
    return null
  }

  return Math.max(waitUntilMs - now, 0)
}
