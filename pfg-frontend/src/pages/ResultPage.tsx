import { useEffect, useState } from 'react'
import axios from 'axios'
import { Link, useNavigate } from 'react-router-dom'
import { getWait } from '../api'
import { parseApiError } from '../api/errorHandling'
import { FlowProgress } from '../components'
import { useEvaluation } from '../context'
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

function formatBackendValue(value: number | string | null): string | number {
  return value ?? 'No recibido'
}

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

export function ResultPage() {
  const {
    result,
    sessionId,
    waitInfo,
    setWaitInfo,
    clearEvaluation,
  } = useEvaluation()
  const navigate = useNavigate()
  const [waitStatus, setWaitStatus] = useState<WaitRequestStatus>('idle')
  const [waitError, setWaitError] = useState<string | null>(null)

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

  const waitPanelStatus =
    result?.decision === 'ESPERA' && !sessionId
      ? 'missing-session'
      : waitStatus

  return (
    <section className="page-panel result-page" aria-labelledby="result-title">
      <p className="eyebrow">Resultado</p>
      <FlowProgress currentStep="result" />
      <h1 id="result-title">Resultado de la evaluación</h1>

      {result ? (
        <>
          <p className="description">
            Resultado final recibido desde el backend para esta evaluación.
          </p>
          <div
            className={`result-summary result-summary--${result.decision.toLowerCase()}`}
          >
            <p className="result-decision">{result.decision}</p>
            <p className="result-message">
              {decisionMessages[result.decision]}
            </p>
          </div>
          <dl className="result-details" aria-label="Detalle del resultado">
            <div>
              <dt>Score</dt>
              <dd>{formatScore(result.score)}</dd>
            </div>
            <div>
              <dt>Decisión</dt>
              <dd>{result.decision}</dd>
            </div>
            <div>
              <dt>Métrica más débil</dt>
              <dd>{formatBackendValue(result.weakest_metric)}</dd>
            </div>
            <div>
              <dt>Recomendación</dt>
              <dd>
                {getRecommendationMessage(result.recommendation_key)}
                {result.recommendation_key && (
                  <span className="technical-key">
                    Key: {result.recommendation_key}
                  </span>
                )}
              </dd>
            </div>
          </dl>
          {result.decision === 'ESPERA' && (
            <WaitInfoPanel
              onRetry={handleRetryEvaluation}
              status={waitPanelStatus}
              waitError={waitError}
              waitInfo={waitInfo}
            />
          )}
        </>
      ) : (
        <>
          <p className="description">
            Todavía no hay resultado guardado para esta evaluación.
          </p>
          <p className="page-status">
            Vuelve a la evaluación para completar el flujo de juegos y solicitar
            el resultado al backend.
          </p>
          <div className="page-actions">
            <Link className="primary-link" to="/evaluation">
              Volver a la evaluación
            </Link>
          </div>
        </>
      )}
    </section>
  )
}

function WaitInfoPanel({
  onRetry,
  status,
  waitError,
  waitInfo,
}: {
  onRetry: () => void
  status: WaitRequestStatus
  waitError: string | null
  waitInfo: WaitResponse | null
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!waitInfo?.wait_until) {
      return
    }

    const intervalId = window.setInterval(() => {
      setNow(Date.now())
    }, 1_000)

    return () => window.clearInterval(intervalId)
  }, [waitInfo?.wait_until])

  const remainingMs = getRemainingWaitMs(waitInfo?.wait_until, now)

  if (status === 'loading') {
    return (
      <p className="page-status" aria-live="polite">
        Consultando periodo de espera en el backend...
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
        No hay un periodo de espera asociado a esta sesión. El backend no ha
        devuelto información adicional de espera.
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

  return (
    <section className="result-wait" aria-labelledby="wait-title">
      <h2 id="wait-title">Información de espera</h2>
      <dl className="result-details" aria-label="Detalle de la espera">
        <div>
          <dt>wait_until</dt>
          <dd>{waitInfo.wait_until}</dd>
        </div>
        <div>
          <dt>Countdown</dt>
          <dd>
            {remainingMs === null
              ? 'No disponible'
              : formatCountdown(remainingMs)}
          </dd>
        </div>
        <div>
          <dt>Recomendación</dt>
          <dd>
            {getRecommendationMessage(waitInfo.recommendation_key)}
            {waitInfo.recommendation_key && (
              <span className="technical-key">
                Key: {waitInfo.recommendation_key}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>Motivo</dt>
          <dd>{formatBackendValue(waitInfo.reason)}</dd>
        </div>
      </dl>
      {canRetry && (
        <button
          type="button"
          className="result-retry-button"
          onClick={onRetry}
        >
          Reintentar evaluación
        </button>
      )}
    </section>
  )
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
