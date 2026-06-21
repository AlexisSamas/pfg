import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './PracticeGame.css'
import {
  getAvailableStroopColors,
  getDifferentStroopColor,
  STROOP_COLORS,
  type ColorBlindMode,
} from './stroopColors'

export const PRACTICE_TRIAL_LIMIT = 10

const FEEDBACK_DELAY_MS = 350

type PracticeGameKind = 'cpt' | 'stroop' | 'flanker'
type FeedbackKind = 'correct' | 'incorrect' | 'timeout'

type PracticeGameProps = {
  game: PracticeGameKind
  trialLimit?: number
  trialMs?: number
  colorBlindMode?: ColorBlindMode
  onComplete: () => void
}

type PracticeTrial = {
  stimulus: string
  expectedCode: string | null
  timeoutFeedback: FeedbackKind
  controls: string[]
  validCodes: string[]
  cssColor?: string
  flankerParts?: string[]
}

const GAME_LABELS: Record<PracticeGameKind, string> = {
  cpt: 'CPT',
  stroop: 'Stroop',
  flanker: 'Flanker',
}

const FLANKER_TRIALS: Array<PracticeTrial> = [
  {
    stimulus: '← ← ← ← ←',
    expectedCode: 'ArrowLeft',
    timeoutFeedback: 'timeout',
    controls: ['ArrowLeft = izquierda', 'ArrowRight = derecha'],
    validCodes: ['ArrowLeft', 'ArrowRight'],
    flankerParts: ['←', '←', '←', '←', '←'],
  },
  {
    stimulus: '→ → ← → →',
    expectedCode: 'ArrowLeft',
    timeoutFeedback: 'timeout',
    controls: ['ArrowLeft = izquierda', 'ArrowRight = derecha'],
    validCodes: ['ArrowLeft', 'ArrowRight'],
    flankerParts: ['→', '→', '←', '→', '→'],
  },
  {
    stimulus: '→ → → → →',
    expectedCode: 'ArrowRight',
    timeoutFeedback: 'timeout',
    controls: ['ArrowLeft = izquierda', 'ArrowRight = derecha'],
    validCodes: ['ArrowLeft', 'ArrowRight'],
    flankerParts: ['→', '→', '→', '→', '→'],
  },
  {
    stimulus: '← ← → ← ←',
    expectedCode: 'ArrowRight',
    timeoutFeedback: 'timeout',
    controls: ['ArrowLeft = izquierda', 'ArrowRight = derecha'],
    validCodes: ['ArrowLeft', 'ArrowRight'],
    flankerParts: ['←', '←', '→', '←', '←'],
  },
]

function getCptTrial(trialIndex: number): PracticeTrial {
  const isTarget = trialIndex % 2 === 0
  const nonTargetLetters = ['B', 'K', 'M', 'P', 'T']

  return {
    stimulus: isTarget
      ? 'X'
      : nonTargetLetters[trialIndex % nonTargetLetters.length],
    expectedCode: isTarget ? 'Space' : null,
    timeoutFeedback: isTarget ? 'timeout' : 'correct',
    controls: [
      'Barra espaciadora = responder si aparece X',
      'No pulses si aparece otra letra',
    ],
    validCodes: ['Space'],
  }
}

function getStroopTrial(
  trialIndex: number,
  colorBlindMode?: ColorBlindMode,
): PracticeTrial {
  const availableColors = getAvailableStroopColors(colorBlindMode)
  const word = availableColors[trialIndex % availableColors.length]
  const ink =
    trialIndex % 2 === 0
      ? word
      : getDifferentStroopColor(word, availableColors)

  return {
    stimulus: STROOP_COLORS[word].label,
    expectedCode: STROOP_COLORS[ink].key,
    timeoutFeedback: 'timeout',
    controls: availableColors.map((color) => STROOP_COLORS[color].controlLabel),
    validCodes: availableColors.map((color) => STROOP_COLORS[color].key),
    cssColor: STROOP_COLORS[ink].cssColor,
  }
}

function getPracticeTrial(
  game: PracticeGameKind,
  trialIndex: number,
  colorBlindMode?: ColorBlindMode,
): PracticeTrial {
  if (game === 'cpt') {
    return getCptTrial(trialIndex)
  }

  if (game === 'stroop') {
    return getStroopTrial(trialIndex, colorBlindMode)
  }

  return FLANKER_TRIALS[trialIndex % FLANKER_TRIALS.length]
}

function getFeedbackText(feedback: FeedbackKind): string {
  if (feedback === 'correct') {
    return 'Correcto'
  }

  if (feedback === 'incorrect') {
    return 'Incorrecto'
  }

  return 'Sin respuesta / demasiado tarde'
}

export function PracticeGame({
  game,
  trialLimit = PRACTICE_TRIAL_LIMIT,
  trialMs = 1_500,
  colorBlindMode,
  onComplete,
}: PracticeGameProps) {
  const [trialIndex, setTrialIndex] = useState(0)
  const [feedback, setFeedback] = useState<FeedbackKind | null>(null)
  const [isComplete, setIsComplete] = useState(false)
  const timeoutRef = useRef<number | null>(null)
  const feedbackTimeoutRef = useRef<number | null>(null)

  const currentTrial = useMemo(
    () => getPracticeTrial(game, trialIndex, colorBlindMode),
    [colorBlindMode, game, trialIndex],
  )
  const gameLabel = GAME_LABELS[game]

  const clearTrialTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const finishTrial = useCallback(
    (nextFeedback: FeedbackKind) => {
      if (feedback || isComplete) {
        return
      }

      clearTrialTimeout()
      setFeedback(nextFeedback)

      feedbackTimeoutRef.current = window.setTimeout(() => {
        setFeedback(null)
        setTrialIndex((currentIndex) => {
          const nextIndex = currentIndex + 1

          if (nextIndex >= trialLimit) {
            setIsComplete(true)
            return currentIndex
          }

          return nextIndex
        })
      }, FEEDBACK_DELAY_MS)
    },
    [clearTrialTimeout, feedback, isComplete, trialLimit],
  )

  useEffect(() => {
    if (feedback || isComplete) {
      return
    }

    timeoutRef.current = window.setTimeout(() => {
      finishTrial(currentTrial.timeoutFeedback)
    }, trialMs)

    return clearTrialTimeout
  }, [
    clearTrialTimeout,
    currentTrial.timeoutFeedback,
    feedback,
    finishTrial,
    isComplete,
    trialIndex,
    trialMs,
  ])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (feedback || isComplete) {
        return
      }

      const validCodes = new Set(currentTrial.validCodes)

      if (!validCodes.has(event.code)) {
        return
      }

      event.preventDefault()
      finishTrial(event.code === currentTrial.expectedCode ? 'correct' : 'incorrect')
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentTrial, feedback, finishTrial, isComplete])

  useEffect(() => {
    return () => {
      clearTrialTimeout()

      if (feedbackTimeoutRef.current !== null) {
        window.clearTimeout(feedbackTimeoutRef.current)
      }
    }
  }, [clearTrialTimeout])

  if (isComplete) {
    return (
      <section className="practice-game" aria-labelledby="practice-complete-title">
        <div className="practice-panel">
          <p className="eyebrow">Práctica {gameLabel}</p>
          <h1 id="practice-complete-title">Práctica {gameLabel} completada</h1>
          <p className="description">
            Has terminado los {trialLimit} ensayos de práctica. Esta fase no se
            ha incluido en la puntuación ni se enviará al backend.
          </p>
          <button type="button" className="primary-action" onClick={onComplete}>
            Comenzar evaluación real
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="practice-game" aria-labelledby="practice-title">
      <div className="practice-panel">
        <p className="eyebrow">Práctica</p>
        <h1 id="practice-title">Práctica {gameLabel} — {trialLimit} ensayos</h1>
        <p className="description">Esta fase no cuenta para la puntuación.</p>
        <p className="description">
          Recibirás feedback para familiarizarte con la tarea.
        </p>

        <div className="practice-summary" aria-live="polite">
          <span>Ensayo {trialIndex + 1} de {trialLimit}</span>
          <span>Feedback inmediato</span>
        </div>

        <div className="practice-stimulus" aria-live="assertive">
          {currentTrial.flankerParts ? (
            <span className="practice-flanker" aria-label={currentTrial.stimulus}>
              {currentTrial.flankerParts.map((arrow, index) => (
                <span
                  className={index === 2 ? 'central-arrow' : undefined}
                  key={`${arrow}-${index}`}
                >
                  {arrow}
                </span>
              ))}
            </span>
          ) : (
            <span style={{ color: currentTrial.cssColor }}>
              {currentTrial.stimulus}
            </span>
          )}
        </div>

        <div className="practice-controls" aria-label={`Controles práctica ${gameLabel}`}>
          {currentTrial.controls.map((control) => (
            <span key={control}>{control}</span>
          ))}
        </div>

        {feedback && (
          <p
            className={`form-message practice-feedback ${
              feedback === 'correct' ? 'success-message' : 'error-message'
            }`}
            role="status"
          >
            {getFeedbackText(feedback)}
          </p>
        )}
      </div>
    </section>
  )
}
