import { useEffect, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { createSession, sendEvents } from '../api'
import { parseApiError, type ApiErrorInfo } from '../api/errorHandling'
import {
  CPTGame,
  FlankerGame,
  GameInstructions,
  PracticeGame,
  StroopGame,
} from '../components'
import { getGameDurationMs } from '../config/evaluation'
import { useAuth, useEvaluation, type CurrentGame } from '../context'
import { getLastEvaluationFromToken } from '../utils/jwt'
import { formatCountdown, parseBackendDateMs } from '../utils/time'
import {
  getAvailableStroopColors,
  STROOP_COLORS,
  type ColorBlindMode,
  type ExcludableStroopColor,
} from '../components/games/stroopColors'
import './StartEvaluationPage.css'

type GamePhase =
  | 'accessibility'
  | 'instructions'
  | 'practice'
  | 'practice-completed'
  | 'running'
  | 'completed'
const GAME_DURATION_MS = getGameDurationMs()
const EVALUATION_FLOW_STORAGE_KEY = 'pfg_evaluation_flow'

const STROOP_EXCLUDABLE_OPTIONS: Array<{
  value: ExcludableStroopColor
  label: string
}> = [
  { value: 'blue', label: 'Gama azul' },
  { value: 'red', label: 'Gama roja' },
  { value: 'green', label: 'Gama verde' },
]

function pushEvaluationHistory(
  currentGame: Exclude<CurrentGame, 'completed' | null>,
  gamePhase: GamePhase,
) {
  window.history.pushState(
    { pfgEvaluationFlow: true, currentGame, gamePhase },
    '',
    window.location.href,
  )
}

type StoredEvaluationFlow = {
  currentGame: CurrentGame
  gamePhase: GamePhase
  stroopColorBlindMode: ColorBlindMode
}

function readStoredEvaluationFlow(): StoredEvaluationFlow | null {
  const rawFlow = window.sessionStorage.getItem(EVALUATION_FLOW_STORAGE_KEY)

  if (!rawFlow) {
    return null
  }

  try {
    return JSON.parse(rawFlow) as StoredEvaluationFlow
  } catch {
    window.sessionStorage.removeItem(EVALUATION_FLOW_STORAGE_KEY)
    return null
  }
}

function getInitialGamePhase(currentGame: CurrentGame): GamePhase {
  const storedFlow = readStoredEvaluationFlow()

  if (storedFlow?.currentGame === currentGame) {
    return storedFlow.gamePhase
  }

  return currentGame === 'completed' ? 'completed' : 'instructions'
}

function getInitialStroopColorBlindMode(): ColorBlindMode {
  return (
    readStoredEvaluationFlow()?.stroopColorBlindMode ?? {
      enabled: false,
      excludedColor: 'blue',
    }
  )
}

function isBlockedForContext(
  token: string | null,
  contextId: string,
): boolean {
  const lastEvaluation = getLastEvaluationFromToken(token)

  return Boolean(
    lastEvaluation?.context_id === contextId &&
      lastEvaluation.decision === 'BLOQUEO' &&
      !lastEvaluation.manual_grant,
  )
}

export function StartEvaluationPage() {
  const {
    contextId,
    sessionId,
    accumulatedEvents,
    currentGame,
    clearEvaluation,
    startEvaluation,
    setCurrentGame,
  } = useEvaluation()
  const { logout, token } = useAuth()
  const navigate = useNavigate()
  const [gamePhase, setGamePhase] = useState<GamePhase>(() =>
    getInitialGamePhase(currentGame),
  )
  const [isLoading, setIsLoading] = useState(false)
  const [errorInfo, setErrorInfo] = useState<ApiErrorInfo | null>(null)
  const [eventsSent, setEventsSent] = useState(false)
  const [isSendingEvents, setIsSendingEvents] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [receivedEvents, setReceivedEvents] = useState<number | null>(null)
  const [exitWarningOpen, setExitWarningOpen] = useState(false)
  const [stroopColorBlindMode, setStroopColorBlindMode] =
    useState<ColorBlindMode>(getInitialStroopColorBlindMode)

  useEffect(() => {
    if (!sessionId || !currentGame) {
      window.sessionStorage.removeItem(EVALUATION_FLOW_STORAGE_KEY)
      return
    }

    const flowToStore: StoredEvaluationFlow = {
      currentGame,
      gamePhase,
      stroopColorBlindMode,
    }

    window.sessionStorage.setItem(
      EVALUATION_FLOW_STORAGE_KEY,
      JSON.stringify(flowToStore),
    )
  }, [currentGame, gamePhase, sessionId, stroopColorBlindMode])

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

    async function submitEventsAndFetchResult() {
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
        setIsSendingEvents(false)
        navigate('/result', { replace: true })
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

    void submitEventsAndFetchResult()

    return () => {
      isActive = false
    }
  }, [
    accumulatedEvents,
    currentGame,
    eventsSent,
    navigate,
    sessionId,
  ])

  useEffect(() => {
    function handleBrowserBack() {
      if (currentGame === null || currentGame === 'completed') {
        return
      }

      if (gamePhase === 'running') {
        window.history.pushState(
          { pfgEvaluationFlow: true, currentGame, gamePhase },
          '',
          window.location.href,
        )
        setExitWarningOpen(true)
        return
      }

      if (
        gamePhase === 'completed' &&
        (currentGame === 'cpt' || currentGame === 'stroop')
      ) {
        window.history.pushState(
          { pfgEvaluationFlow: true, currentGame, gamePhase },
          '',
          window.location.href,
        )
        setExitWarningOpen(true)
        return
      }

      if (gamePhase === 'practice' || gamePhase === 'practice-completed') {
        setGamePhase('instructions')
        return
      }

      if (gamePhase === 'accessibility') {
        setCurrentGame('cpt')
        setGamePhase('completed')
        return
      }

      if (gamePhase === 'instructions') {
        if (currentGame === 'cpt') {
          if (sessionId) {
            window.history.pushState(
              { pfgEvaluationFlow: true, currentGame, gamePhase },
              '',
              window.location.href,
            )
            setExitWarningOpen(true)
            return
          }

          setCurrentGame(null)
          setGamePhase('instructions')
          return
        }

        if (currentGame === 'stroop') {
          setGamePhase('accessibility')
          return
        }

        setCurrentGame('stroop')
        setGamePhase('completed')
      }
    }

    window.addEventListener('popstate', handleBrowserBack)

    return () => {
      window.removeEventListener('popstate', handleBrowserBack)
    }
  }, [currentGame, gamePhase, sessionId, setCurrentGame])

  async function handleStartEvaluation() {
    if (isLoading) {
      return
    }

    if (isBlockedForContext(token, contextId)) {
      setErrorInfo({
        message:
          'El sistema ha bloqueado nuevos intentos para este contexto tras un resultado de bloqueo. Debes contactar con el docente.',
        requiresManualGrant: true,
        status: 403,
      })
      return
    }

    if (sessionId || currentGame) {
      setErrorInfo(null)
      if (!currentGame) {
        pushEvaluationHistory('cpt', 'instructions')
      }
      setCurrentGame(currentGame ?? 'cpt')
      setGamePhase('instructions')
      return
    }

    setIsLoading(true)
    setErrorInfo(null)
    setEventsSent(false)
    setReceivedEvents(null)
    setSendError(null)

    try {
      const session = await createSession({ context_id: contextId })

      startEvaluation({
        contextId: session.context_id,
        sessionId: session.id,
        attemptNumber: session.attempt_number,
      })
      pushEvaluationHistory('cpt', 'instructions')
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
      }
    } finally {
      setIsLoading(false)
    }
  }

  function goToGame(game: Exclude<CurrentGame, 'completed' | null>) {
    const nextPhase = game === 'stroop' ? 'accessibility' : 'instructions'

    pushEvaluationHistory(game, nextPhase)
    setCurrentGame(game)
    setGamePhase(nextPhase)
  }

  function goToStroopInstructions() {
    pushEvaluationHistory('stroop', 'instructions')
    setGamePhase('instructions')
  }

  function goToPractice() {
    if (currentGame && currentGame !== 'completed') {
      pushEvaluationHistory(currentGame, 'practice')
    }
    setGamePhase('practice')
  }

  function goToRunning() {
    if (currentGame && currentGame !== 'completed') {
      pushEvaluationHistory(currentGame, 'running')
    }
    setGamePhase('running')
  }

  function handlePracticeComplete() {
    setGamePhase('practice-completed')
  }

  function handleStayInTest() {
    setExitWarningOpen(false)
  }

  function handleExitTest() {
    setExitWarningOpen(false)
    window.sessionStorage.removeItem(EVALUATION_FLOW_STORAGE_KEY)
    clearEvaluation()
    navigate('/', { replace: true, state: { refreshStudentStatus: true } })
  }

  if (currentGame === 'cpt' && gamePhase === 'instructions') {
    return (
      <>
        <GameInstructions
          compact
          title="CPT: atención sostenida"
          description="Verás letras una a una. Mantén la atención y responde únicamente cuando aparezca la letra objetivo."
          controls={[
            'Barra espaciadora: responder cuando la letra sea X.',
            'No pulses ninguna tecla si aparece otra letra.',
          ]}
          onStart={goToPractice}
        />
        <ExitTestDialog
          isOpen={exitWarningOpen}
          onCancel={handleStayInTest}
          onConfirm={handleExitTest}
        />
      </>
    )
  }

  if (currentGame === 'cpt' && gamePhase === 'practice') {
    return (
      <>
        <PracticeGame
          game="cpt"
          onComplete={goToRunning}
          onPracticeComplete={handlePracticeComplete}
        />
        <ExitTestDialog
          isOpen={exitWarningOpen}
          onCancel={handleStayInTest}
          onConfirm={handleExitTest}
        />
      </>
    )
  }

  if (currentGame === 'cpt' && gamePhase === 'practice-completed') {
    return (
      <>
        <PracticeCompletedPanel gameName="CPT" onStartReal={goToRunning} />
        <ExitTestDialog
          isOpen={exitWarningOpen}
          onCancel={handleStayInTest}
          onConfirm={handleExitTest}
        />
      </>
    )
  }

  if (currentGame === 'cpt' && gamePhase === 'running') {
    return (
      <>
        <CPTGame
          durationMs={GAME_DURATION_MS}
          intervalMs={1_000}
          onComplete={() => setGamePhase('completed')}
        />
        <ExitTestDialog
          isOpen={exitWarningOpen}
          onCancel={handleStayInTest}
          onConfirm={handleExitTest}
        />
      </>
    )
  }

  if (currentGame === 'cpt' && gamePhase === 'completed') {
    return (
      <>
        <CompletedGamePanel
          gameName="CPT"
          nextLabel="Continuar a Stroop"
          onNext={() => goToGame('stroop')}
        />
        <ExitTestDialog
          confirmLabel="Salir de la evaluación"
          isOpen={exitWarningOpen}
          message="Hay una evaluación en curso. Si sales ahora, perderás el progreso actual."
          onCancel={handleStayInTest}
          onConfirm={handleExitTest}
          title="Evaluación en curso"
        />
      </>
    )
  }

  if (currentGame === 'stroop' && gamePhase === 'accessibility') {
    return (
      <>
        <StroopAccessibilitySettings
          mode={stroopColorBlindMode}
          onChange={setStroopColorBlindMode}
          onConfirm={goToStroopInstructions}
        />
        <ExitTestDialog
          isOpen={exitWarningOpen}
          onCancel={handleStayInTest}
          onConfirm={handleExitTest}
        />
      </>
    )
  }

  if (currentGame === 'stroop' && gamePhase === 'instructions') {
    const availableStroopColors = getAvailableStroopColors(stroopColorBlindMode)
    const stroopControlLine = availableStroopColors
      .map((color) => STROOP_COLORS[color].controlLabel.replace(' = ', ': '))
      .join(', ')

    return (
      <>
        <GameInstructions
          compact
          title="Stroop: color e inhibición"
          description="Verás palabras de colores. Responde al color de la tinta y evita dejarte guiar por el significado de la palabra."
          controls={[
            stroopControlLine,
            'Responde solo cuando tengas claro el color de la tinta.',
          ]}
          onStart={goToPractice}
        />
        <ExitTestDialog
          isOpen={exitWarningOpen}
          onCancel={handleStayInTest}
          onConfirm={handleExitTest}
        />
      </>
    )
  }

  if (currentGame === 'stroop' && gamePhase === 'practice') {
    return (
      <>
        <PracticeGame
          colorBlindMode={stroopColorBlindMode}
          game="stroop"
          onComplete={goToRunning}
          onPracticeComplete={handlePracticeComplete}
        />
        <ExitTestDialog
          isOpen={exitWarningOpen}
          onCancel={handleStayInTest}
          onConfirm={handleExitTest}
        />
      </>
    )
  }

  if (currentGame === 'stroop' && gamePhase === 'practice-completed') {
    return (
      <>
        <PracticeCompletedPanel gameName="Stroop" onStartReal={goToRunning} />
        <ExitTestDialog
          isOpen={exitWarningOpen}
          onCancel={handleStayInTest}
          onConfirm={handleExitTest}
        />
      </>
    )
  }

  if (currentGame === 'stroop' && gamePhase === 'running') {
    return (
      <>
        <StroopGame
          colorBlindMode={stroopColorBlindMode}
          durationMs={GAME_DURATION_MS}
          trialMs={1_000}
          onComplete={() => setGamePhase('completed')}
        />
        <ExitTestDialog
          isOpen={exitWarningOpen}
          onCancel={handleStayInTest}
          onConfirm={handleExitTest}
        />
      </>
    )
  }

  if (currentGame === 'stroop' && gamePhase === 'completed') {
    return (
      <>
        <CompletedGamePanel
          gameName="Stroop"
          nextLabel="Continuar a Flanker"
          onNext={() => goToGame('flanker')}
        />
        <ExitTestDialog
          confirmLabel="Salir de la evaluación"
          isOpen={exitWarningOpen}
          message="Hay una evaluación en curso. Si sales ahora, perderás el progreso actual."
          onCancel={handleStayInTest}
          onConfirm={handleExitTest}
          title="Evaluación en curso"
        />
      </>
    )
  }

  if (currentGame === 'flanker' && gamePhase === 'instructions') {
    return (
      <>
        <GameInstructions
          compact
          title="Flanker: flecha central"
          description="Verás una fila de siete símbolos. Responde únicamente a la dirección del símbolo central, aunque los laterales distraigan."
          controls={[
            'ArrowLeft = izquierda, ArrowRight = derecha.',
            'Ignora las flechas laterales y prioriza responder a la flecha central.',
          ]}
          onStart={goToPractice}
        />
        <ExitTestDialog
          isOpen={exitWarningOpen}
          onCancel={handleStayInTest}
          onConfirm={handleExitTest}
        />
      </>
    )
  }

  if (currentGame === 'flanker' && gamePhase === 'practice') {
    return (
      <>
        <PracticeGame
          game="flanker"
          onComplete={goToRunning}
          onPracticeComplete={handlePracticeComplete}
        />
        <ExitTestDialog
          isOpen={exitWarningOpen}
          onCancel={handleStayInTest}
          onConfirm={handleExitTest}
        />
      </>
    )
  }

  if (currentGame === 'flanker' && gamePhase === 'practice-completed') {
    return (
      <>
        <PracticeCompletedPanel gameName="Flanker" onStartReal={goToRunning} />
        <ExitTestDialog
          isOpen={exitWarningOpen}
          onCancel={handleStayInTest}
          onConfirm={handleExitTest}
        />
      </>
    )
  }

  if (currentGame === 'flanker' && gamePhase === 'running') {
    return (
      <>
        <FlankerGame
          durationMs={GAME_DURATION_MS}
          trialMs={1_000}
          onComplete={() => {
            setCurrentGame('completed')
            setGamePhase('completed')
          }}
        />
        <ExitTestDialog
          isOpen={exitWarningOpen}
          onCancel={handleStayInTest}
          onConfirm={handleExitTest}
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
        <p className="eyebrow">Evaluación</p>
        <h1 id="evaluation-completed-title">Evaluación completada</h1>
        <p className="description">
          Has completado CPT, Stroop y Flanker. Se han acumulado{' '}
          {accumulatedEvents.length} eventos en la evaluación actual.
        </p>

        {sessionId ? (
          <EventSendStatus
            hasEvents={accumulatedEvents.length > 0}
            isSendingEvents={isSendingEvents}
            receivedEvents={receivedEvents}
            sendError={sendError}
          />
        ) : (
          <p className="page-status">
            No se han enviado eventos porque no hay una sesión activa.
          </p>
        )}
      </section>
    )
  }

  return (
    <section className="page-panel start-evaluation" aria-labelledby="start-title">
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
        {isLoading ? 'Creando sesión...' : 'Realizar intento'}
      </button>

    </section>
  )
}

function StroopAccessibilitySettings({
  mode,
  onChange,
  onConfirm,
}: {
  mode: ColorBlindMode
  onChange: (mode: ColorBlindMode) => void
  onConfirm: () => void
}) {
  return (
    <section
      className="page-panel start-evaluation"
      aria-labelledby="stroop-accessibility-title"
    >
    <fieldset className="stroop-accessibility">
      <legend id="stroop-accessibility-title">Accesibilidad visual</legend>
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
      <button type="button" className="primary-action" onClick={onConfirm}>
        Confirmar
      </button>
    </section>
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
  nextLabel,
  onNext,
}: {
  gameName: string
  nextLabel: string
  onNext: () => void
}) {
  return (
    <section className="page-panel start-evaluation" aria-labelledby="done-title">
      <p className="eyebrow">{gameName}</p>
      <h1 id="done-title">{gameName} finalizado</h1>
      <p className="description">
        Se han guardado los eventos en la evaluación actual.
      </p>
      <button type="button" className="primary-action" onClick={onNext}>
        {nextLabel}
      </button>
    </section>
  )
}

function PracticeCompletedPanel({
  gameName,
  onStartReal,
}: {
  gameName: string
  onStartReal: () => void
}) {
  return (
    <section className="practice-game" aria-labelledby="practice-complete-title">
      <div className="practice-panel">
        <p className="eyebrow">Práctica {gameName}</p>
        <h1 id="practice-complete-title">Práctica {gameName} completada</h1>
        <p className="description">
          Has terminado los 10 ensayos de práctica. Esta fase no se ha incluido
          en la puntuación ni se enviará al sistema.
        </p>
        <button type="button" className="primary-action" onClick={onStartReal}>
          Comenzar evaluación real
        </button>
      </div>
    </section>
  )
}

function ExitTestDialog({
  confirmLabel = 'Salir de la prueba',
  isOpen,
  message = 'Hay una prueba en curso. Si sales ahora, perderás el progreso actual.',
  onCancel,
  onConfirm,
  title = 'Prueba en curso',
}: {
  confirmLabel?: string
  isOpen: boolean
  message?: string
  onCancel: () => void
  onConfirm: () => void
  title?: string
}) {
  if (!isOpen) {
    return null
  }

  return (
    <div
      aria-labelledby="exit-test-title"
      aria-modal="true"
      className="test-exit-backdrop"
      role="dialog"
    >
      <div className="test-exit-panel">
        <h2 id="exit-test-title">{title}</h2>
        <p>{message}</p>
        <div className="test-exit-actions">
          <button
            type="button"
            className="secondary-test-action"
            onClick={onCancel}
          >
            Permanecer
          </button>
          <button type="button" className="primary-action" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function EventSendStatus({
  hasEvents,
  isSendingEvents,
  receivedEvents,
  sendError,
}: {
  hasEvents: boolean
  isSendingEvents: boolean
  receivedEvents: number | null
  sendError: string | null
}) {
  if (!hasEvents) {
    return (
      <p className="form-message error-message" role="alert">
        No hay eventos registrados para enviar. Vuelve al inicio e inicia una
        evaluación nueva.
      </p>
    )
  }

  if (isSendingEvents) {
    return (
      <p className="page-status" aria-live="polite">
        Enviando datos... Mantén esta pantalla abierta.
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

  if (receivedEvents !== null) {
    return (
      <p className="form-message success-message" role="status">
        Eventos enviados correctamente. Se confirmaron {receivedEvents} eventos
        recibidos.
      </p>
    )
  }

  return (
    <p className="page-status" aria-live="polite">
      Preparando envío de datos...
    </p>
  )
}
