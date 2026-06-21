import { useEffect, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { createSession, getResult, sendEvents } from '../api'
import { parseApiError, type ApiErrorInfo } from '../api/errorHandling'
import {
  CPTGame,
  FlankerGame,
  FlowProgress,
  GameInstructions,
  PracticeGame,
  StroopGame,
  type FlowStep,
} from '../components'
import { getGameDurationMs } from '../config/evaluation'
import { useAuth, useEvaluation, type CurrentGame } from '../context'
import type { GameEvent } from '../types'
import { formatCountdown, parseBackendDateMs } from '../utils/time'
import {
  getAvailableStroopColors,
  STROOP_COLORS,
  type ColorBlindMode,
  type ExcludableStroopColor,
} from '../components/games/stroopColors'
import './StartEvaluationPage.css'

type GamePhase = 'instructions' | 'practice' | 'running' | 'completed'
const GAME_DURATION_MS = getGameDurationMs()

const GAME_PROGRESS: Record<Exclude<CurrentGame, 'completed' | null>, string> = {
  cpt: 'Juego 1 de 3: CPT',
  stroop: 'Juego 2 de 3: Stroop',
  flanker: 'Juego 3 de 3: Flanker',
}

const STROOP_EXCLUDABLE_OPTIONS: Array<{
  value: ExcludableStroopColor
  label: string
}> = [
  { value: 'blue', label: 'Gama azul' },
  { value: 'red', label: 'Gama roja' },
  { value: 'green', label: 'Gama verde' },
]

export function StartEvaluationPage() {
  const {
    contextId,
    sessionId,
    accumulatedEvents,
    currentGame,
    startEvaluation,
    setCurrentGame,
    setResult,
  } = useEvaluation()
  const { login: updateToken, logout } = useAuth()
  const navigate = useNavigate()
  const [gamePhase, setGamePhase] = useState<GamePhase>('instructions')
  const [isLoading, setIsLoading] = useState(false)
  const [errorInfo, setErrorInfo] = useState<ApiErrorInfo | null>(null)
  const [canUseLocalCpt, setCanUseLocalCpt] = useState(false)
  const [completedCptEvents, setCompletedCptEvents] = useState<GameEvent[]>([])
  const [completedStroopEvents, setCompletedStroopEvents] = useState<GameEvent[]>([])
  const [eventsSent, setEventsSent] = useState(false)
  const [isSendingEvents, setIsSendingEvents] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [receivedEvents, setReceivedEvents] = useState<number | null>(null)
  const [resultRequested, setResultRequested] = useState(false)
  const [isFetchingResult, setIsFetchingResult] = useState(false)
  const [resultError, setResultError] = useState<string | null>(null)
  const [stroopColorBlindMode, setStroopColorBlindMode] =
    useState<ColorBlindMode>({
      enabled: false,
      excludedColor: 'blue',
    })

  useEffect(() => {
    if (
      currentGame !== 'completed' ||
      !sessionId ||
      accumulatedEvents.length === 0 ||
      eventsSent
    ) {
      return
    }

    let isActive = true
    const activeSessionId = sessionId

    async function submitEvents() {
      setIsSendingEvents(true)
      setSendError(null)

      try {
        const response = await sendEvents(activeSessionId, {
          events: accumulatedEvents,
        })

        if (!isActive) {
          return
        }

        setReceivedEvents(response.received)
        setEventsSent(true)
      } catch (requestError) {
        if (!isActive) {
          return
        }

        setSendError(parseApiError(requestError).message)
      } finally {
        if (isActive) {
          setIsSendingEvents(false)
        }
      }
    }

    void submitEvents()

    return () => {
      isActive = false
    }
  }, [accumulatedEvents, currentGame, eventsSent, sessionId])

  useEffect(() => {
    if (!eventsSent || !sessionId || resultRequested) {
      return
    }

    let isActive = true
    const activeSessionId = sessionId

    async function fetchFinalResult() {
      setResultRequested(true)
      setIsFetchingResult(true)
      setResultError(null)

      try {
        const result = await getResult(activeSessionId)

        if (!isActive) {
          return
        }

        if (result.new_access_token) {
          updateToken(result.new_access_token)
        }

        setResult(result)
        navigate('/result', { replace: true })
      } catch (requestError) {
        if (!isActive) {
          return
        }

        setResultError(parseApiError(requestError).message)
      } finally {
        if (isActive) {
          setIsFetchingResult(false)
        }
      }
    }

    void fetchFinalResult()

    return () => {
      isActive = false
    }
  }, [
    eventsSent,
    navigate,
    resultRequested,
    sessionId,
    setResult,
    updateToken,
  ])

  async function handleStartEvaluation() {
    if (isLoading) {
      return
    }

    if (sessionId || currentGame) {
      setErrorInfo(null)
      setCanUseLocalCpt(false)
      setCurrentGame(currentGame ?? 'cpt')
      setGamePhase('instructions')
      return
    }

    setIsLoading(true)
    setErrorInfo(null)
    setCanUseLocalCpt(false)
    setEventsSent(false)
    setReceivedEvents(null)
    setSendError(null)
    setResultRequested(false)
    setResultError(null)

    try {
      const session = await createSession({ context_id: contextId })

      startEvaluation({
        contextId: session.context_id,
        sessionId: session.id,
        attemptNumber: session.attempt_number,
      })
      setGamePhase('instructions')
    } catch (requestError) {
      if (
        axios.isAxiosError(requestError) &&
        requestError.response?.status === 401
      ) {
        logout()
        navigate('/login', { replace: true })
      } else {
        const parsedError = parseApiError(requestError)
        setErrorInfo(parsedError)
        setCanUseLocalCpt(parsedError.status === 403)
      }
    } finally {
      setIsLoading(false)
    }
  }

  function goToGame(game: Exclude<CurrentGame, 'completed' | null>) {
    setCurrentGame(game)
    setGamePhase('instructions')
  }

  if (currentGame === 'cpt' && gamePhase === 'instructions') {
    return (
      <>
        <FlowProgress currentStep="cpt" />
        <ProgressLabel game="cpt" />
        <GameInstructions
          title="CPT: atención sostenida"
          description="Verás letras una a una. Mantén la atención y responde únicamente cuando aparezca la letra objetivo."
          controls={[
            'Barra espaciadora: responder cuando la letra sea X.',
            'No pulses ninguna tecla si aparece otra letra.',
            'Si dudas, espera al siguiente estímulo.',
          ]}
          onStart={() => setGamePhase('practice')}
        />
      </>
    )
  }

  if (currentGame === 'cpt' && gamePhase === 'practice') {
    return (
      <>
        <FlowProgress currentStep="cpt" />
        <ProgressLabel game="cpt" />
        <PracticeGame game="cpt" onComplete={() => setGamePhase('running')} />
      </>
    )
  }

  if (currentGame === 'cpt' && gamePhase === 'running') {
    return (
      <>
        <FlowProgress currentStep="cpt" />
        <ProgressLabel game="cpt" />
        <CPTGame
          durationMs={GAME_DURATION_MS}
          intervalMs={1_000}
          onComplete={(events) => {
            setCompletedCptEvents(events)
            setGamePhase('completed')
          }}
        />
      </>
    )
  }

  if (currentGame === 'cpt' && gamePhase === 'completed') {
    return (
      <CompletedGamePanel
        gameName="CPT"
        eventCount={completedCptEvents.length}
        flowStep="cpt"
        nextLabel="Continuar a Stroop"
        onNext={() => goToGame('stroop')}
      />
    )
  }

  if (currentGame === 'stroop' && gamePhase === 'instructions') {
    const availableStroopColors = getAvailableStroopColors(stroopColorBlindMode)

    return (
      <>
        <FlowProgress currentStep="stroop" />
        <ProgressLabel game="stroop" />
        <StroopAccessibilitySettings
          mode={stroopColorBlindMode}
          onChange={setStroopColorBlindMode}
        />
        <GameInstructions
          title="Stroop: color e inhibición"
          description="Verás palabras de colores. Responde al color de la tinta y evita dejarte guiar por el significado de la palabra."
          controls={[
            ...availableStroopColors.map(
              (color) => `${STROOP_COLORS[color].controlLabel}.`,
            ),
            'Responde solo cuando tengas claro el color de la tinta.',
          ]}
          onStart={() => setGamePhase('practice')}
        />
      </>
    )
  }

  if (currentGame === 'stroop' && gamePhase === 'practice') {
    return (
      <>
        <FlowProgress currentStep="stroop" />
        <ProgressLabel game="stroop" />
        <PracticeGame
          colorBlindMode={stroopColorBlindMode}
          game="stroop"
          onComplete={() => setGamePhase('running')}
        />
      </>
    )
  }

  if (currentGame === 'stroop' && gamePhase === 'running') {
    return (
      <>
        <FlowProgress currentStep="stroop" />
        <ProgressLabel game="stroop" />
        <StroopGame
          colorBlindMode={stroopColorBlindMode}
          durationMs={GAME_DURATION_MS}
          trialMs={1_500}
          onComplete={(events) => {
            setCompletedStroopEvents(events)
            setGamePhase('completed')
          }}
        />
      </>
    )
  }

  if (currentGame === 'stroop' && gamePhase === 'completed') {
    return (
      <CompletedGamePanel
        gameName="Stroop"
        eventCount={completedStroopEvents.length}
        flowStep="stroop"
        nextLabel="Continuar a Flanker"
        onNext={() => goToGame('flanker')}
      />
    )
  }

  if (currentGame === 'flanker' && gamePhase === 'instructions') {
    return (
      <>
        <FlowProgress currentStep="flanker" />
        <ProgressLabel game="flanker" />
        <GameInstructions
          title="Flanker: flecha central"
          description="Verás una fila de cinco flechas. Responde únicamente a la dirección de la flecha central, aunque las laterales distraigan."
          controls={[
            'ArrowLeft = izquierda.',
            'ArrowRight = derecha.',
            'Ignora las flechas laterales.',
            'Prioriza responder a la flecha central.',
          ]}
          onStart={() => setGamePhase('practice')}
        />
      </>
    )
  }

  if (currentGame === 'flanker' && gamePhase === 'practice') {
    return (
      <>
        <FlowProgress currentStep="flanker" />
        <ProgressLabel game="flanker" />
        <PracticeGame game="flanker" onComplete={() => setGamePhase('running')} />
      </>
    )
  }

  if (currentGame === 'flanker' && gamePhase === 'running') {
    return (
      <>
        <FlowProgress currentStep="flanker" />
        <ProgressLabel game="flanker" />
        <FlankerGame
          durationMs={GAME_DURATION_MS}
          trialMs={1_500}
          onComplete={() => {
            setCurrentGame('completed')
            setGamePhase('completed')
          }}
        />
      </>
    )
  }

  if (currentGame === 'completed') {
    return (
      <section
        className="page-panel start-evaluation"
        aria-labelledby="evaluation-completed-title"
      >
        <FlowProgress currentStep="result" />
        <p className="eyebrow">Evaluación</p>
        <h1 id="evaluation-completed-title">Evaluación completada</h1>
        <p className="description">
          Has completado CPT, Stroop y Flanker. Se han acumulado{' '}
          {accumulatedEvents.length} eventos en la evaluación actual.
        </p>

        {sessionId ? (
          <EventSendStatus
            isFetchingResult={isFetchingResult}
            isSendingEvents={isSendingEvents}
            receivedEvents={receivedEvents}
            resultError={resultError}
            sendError={sendError}
          />
        ) : (
          <p className="page-status">
            Modo local: no se han enviado eventos porque no hay sesión backend.
          </p>
        )}
      </section>
    )
  }

  return (
    <section className="page-panel start-evaluation" aria-labelledby="start-title">
      <FlowProgress currentStep="session" />
      <p className="eyebrow">Evaluación</p>
      <h1 id="start-title">Iniciar evaluación cognitiva</h1>
      <p className="description">
        Este proceso creará una sesión de evaluación y preparará el flujo de
        juegos cognitivos para registrar tus eventos.
      </p>

      <p className="games-notice">
        Realizarás tres juegos: CPT, Stroop y Flanker. Antes de cada uno harás
        una práctica de 10 ensayos que no cuenta para la puntuación.
      </p>

      {errorInfo && <ApiErrorMessage errorInfo={errorInfo} />}

      <button
        type="button"
        className="primary-action"
        onClick={handleStartEvaluation}
        disabled={isLoading}
      >
        {isLoading ? 'Creando sesión en el backend...' : 'Iniciar evaluación'}
      </button>

      {canUseLocalCpt && (
        <button
          type="button"
          className="secondary-action"
          disabled={isLoading}
          onClick={() => {
            setErrorInfo(null)
            setCanUseLocalCpt(false)
            setCurrentGame('cpt')
            setGamePhase('instructions')
          }}
        >
          Probar secuencia sin crear sesión
        </button>
      )}
    </section>
  )
}

function ProgressLabel({
  game,
}: {
  game: Exclude<CurrentGame, 'completed' | null>
}) {
  return <p className="game-progress">{GAME_PROGRESS[game]}</p>
}

function StroopAccessibilitySettings({
  mode,
  onChange,
}: {
  mode: ColorBlindMode
  onChange: (mode: ColorBlindMode) => void
}) {
  return (
    <fieldset className="stroop-accessibility">
      <legend>Accesibilidad visual</legend>
      <p>
        Si tienes dificultad para distinguir alguna gama de colores, puedes
        activar el modo daltónico para excluir esa gama durante el juego Stroop.
      </p>
      <p>
        Este ajuste solo modifica los colores usados en el Stroop. Las métricas
        y la puntuación se calculan igual.
      </p>

      <div className="radio-group" role="radiogroup" aria-label="Modo daltónico">
        <label>
          <input
            checked={!mode.enabled}
            name="stroop-colorblind-mode"
            onChange={() =>
              onChange({ enabled: false, excludedColor: mode.excludedColor })
            }
            type="radio"
            value="no"
          />
          No
        </label>
        <label>
          <input
            checked={mode.enabled}
            name="stroop-colorblind-mode"
            onChange={() =>
              onChange({
                enabled: true,
                excludedColor: mode.excludedColor ?? 'blue',
              })
            }
            type="radio"
            value="yes"
          />
          Sí
        </label>
      </div>

      {mode.enabled && (
        <label className="color-range-field">
          Gama de color a excluir
          <select
            onChange={(event) =>
              onChange({
                enabled: true,
                excludedColor: event.target.value as ExcludableStroopColor,
              })
            }
            value={mode.excludedColor ?? 'blue'}
          >
            {STROOP_EXCLUDABLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </fieldset>
  )
}

function ApiErrorMessage({ errorInfo }: { errorInfo: ApiErrorInfo }) {
  const [now, setNow] = useState(() => Date.now())
  const waitUntilMs = errorInfo.waitUntil
    ? parseBackendDateMs(errorInfo.waitUntil)
    : null
  const remainingMs =
    waitUntilMs === null || Number.isNaN(waitUntilMs)
      ? null
      : Math.max(waitUntilMs - now, 0)

  useEffect(() => {
    if (!errorInfo.waitUntil) {
      return
    }

    const intervalId = window.setInterval(() => {
      setNow(Date.now())
    }, 1_000)

    return () => window.clearInterval(intervalId)
  }, [errorInfo.waitUntil])

  return (
    <div className="form-message error-message start-error" role="alert">
      <p>{errorInfo.message}</p>
      {errorInfo.waitUntil && <p>Espera hasta: {errorInfo.waitUntil}</p>}
      {remainingMs !== null && (
        <p>Tiempo restante: {formatCountdown(remainingMs)}</p>
      )}
      {errorInfo.recommendationMessage && (
        <p>{errorInfo.recommendationMessage}</p>
      )}
    </div>
  )
}

function CompletedGamePanel({
  gameName,
  eventCount,
  flowStep,
  nextLabel,
  onNext,
}: {
  gameName: string
  eventCount: number
  flowStep: FlowStep
  nextLabel: string
  onNext: () => void
}) {
  return (
    <section className="page-panel start-evaluation" aria-labelledby="done-title">
      <FlowProgress currentStep={flowStep} />
      <p className="eyebrow">{gameName}</p>
      <h1 id="done-title">{gameName} finalizado</h1>
      <p className="description">
        Se han guardado {eventCount} eventos {gameName} en la evaluación actual.
      </p>
      <button type="button" className="primary-action" onClick={onNext}>
        {nextLabel}
      </button>
    </section>
  )
}

function EventSendStatus({
  isFetchingResult,
  isSendingEvents,
  receivedEvents,
  resultError,
  sendError,
}: {
  isFetchingResult: boolean
  isSendingEvents: boolean
  receivedEvents: number | null
  resultError: string | null
  sendError: string | null
}) {
  if (isSendingEvents) {
    return (
      <p className="page-status" aria-live="polite">
        Enviando eventos al backend. Mantén esta pantalla abierta...
      </p>
    )
  }

  if (sendError) {
    return (
      <p className="form-message error-message" role="alert">
        {sendError} No cierres la aplicación y vuelve a intentarlo desde una
        nueva evaluación si el problema continúa.
      </p>
    )
  }

  if (isFetchingResult) {
    return (
      <p className="page-status" aria-live="polite">
        Eventos recibidos. Obteniendo resultado final del backend...
      </p>
    )
  }

  if (resultError) {
    return (
      <p className="form-message error-message" role="alert">
        {resultError} Los eventos ya se habían enviado, pero no se pudo cargar
        la pantalla de resultado.
      </p>
    )
  }

  if (receivedEvents !== null) {
    return (
      <p className="form-message success-message" role="status">
        Eventos enviados correctamente. El backend confirmó {receivedEvents}{' '}
        eventos recibidos.
      </p>
    )
  }

  return (
    <p className="page-status" aria-live="polite">
      Preparando envío de eventos al backend...
    </p>
  )
}
