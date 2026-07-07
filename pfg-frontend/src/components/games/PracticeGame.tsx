import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './PracticeGame.css'
import {
  GAME_LABELS,
  generateCptPracticeTrials,
  generateFlankerPracticeTrials,
  generateStroopPracticeTrials,
  getPracticeTrial,
  PRACTICE_TRIAL_LIMIT,
  type PracticeTrial,
  type ColorBlindMode,
  type FeedbackKind,
  type PracticeGameKind,
} from './practiceTrials'

type PracticeGameProps = {
  game: PracticeGameKind
  trialLimit?: number
  trialMs?: number
  colorBlindMode?: ColorBlindMode
  onPracticeComplete?: () => void
  onComplete: () => void
}

function getPracticeFeedbackText(feedback: FeedbackKind | null): string {
  if (!feedback) {
    return ''
  }

  return feedback === 'correct' ? 'Correcto' : 'Error'
}

export function PracticeGame({
  game,
  trialLimit = PRACTICE_TRIAL_LIMIT,
  trialMs = 1_500,
  colorBlindMode,
  onPracticeComplete,
  onComplete,
}: PracticeGameProps) {
  const [cptPracticeTrials] = useState<PracticeTrial[] | null>(() =>
    game === 'cpt' ? generateCptPracticeTrials(trialLimit) : null,
  )
  const [stroopPracticeTrials] = useState<PracticeTrial[] | null>(() =>
    game === 'stroop'
      ? generateStroopPracticeTrials(trialLimit, colorBlindMode)
      : null,
  )
  const [flankerPracticeTrials] = useState<PracticeTrial[] | null>(() =>
    game === 'flanker' ? generateFlankerPracticeTrials(trialLimit) : null,
  )
  const [trialIndex, setTrialIndex] = useState(0)
  const [feedback, setFeedback] = useState<FeedbackKind | null>(null)
  const [lastFeedback, setLastFeedback] = useState<FeedbackKind | null>(null)
  const [hasResponded, setHasResponded] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const timeoutRef = useRef<number | null>(null)
  const practiceStartedAtRef = useRef(0)
  const hasRespondedRef = useRef(false)
  const hasNotifiedCompleteRef = useRef(false)

  const currentTrial = useMemo(
    () =>
      game === 'cpt' && cptPracticeTrials
        ? cptPracticeTrials[trialIndex]
        : game === 'stroop' && stroopPracticeTrials
          ? stroopPracticeTrials[trialIndex]
          : game === 'flanker' && flankerPracticeTrials
            ? flankerPracticeTrials[trialIndex]
        : getPracticeTrial(game, trialIndex, colorBlindMode),
    [
      colorBlindMode,
      cptPracticeTrials,
      flankerPracticeTrials,
      game,
      stroopPracticeTrials,
      trialIndex,
    ],
  )
  const gameLabel = GAME_LABELS[game]

  const clearTrialTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const advanceTrial = useCallback(() => {
    setFeedback(null)
    setHasResponded(false)
    hasRespondedRef.current = false
    setTrialIndex((currentIndex) => {
      const nextIndex = currentIndex + 1

      if (nextIndex >= trialLimit) {
        setIsComplete(true)
        return currentIndex
      }

      return nextIndex
    })
  }, [trialLimit])

  useEffect(() => {
    practiceStartedAtRef.current = performance.now()
  }, [])

  useEffect(() => {
    if (isComplete) {
      return
    }

    const trialDeadlineMs =
      practiceStartedAtRef.current + (trialIndex + 1) * trialMs
    const timeoutDelayMs = Math.max(0, trialDeadlineMs - performance.now())

    timeoutRef.current = window.setTimeout(() => {
      if (!hasRespondedRef.current) {
        setFeedback(currentTrial.timeoutFeedback)
        setLastFeedback(currentTrial.timeoutFeedback)
      }

      advanceTrial()
    }, timeoutDelayMs)

    return clearTrialTimeout
  }, [
    advanceTrial,
    clearTrialTimeout,
    currentTrial.timeoutFeedback,
    isComplete,
    trialIndex,
    trialMs,
  ])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isComplete) {
        return
      }

      const validCodes = new Set(currentTrial.validCodes)

      if (!validCodes.has(event.code)) {
        return
      }

      event.preventDefault()

      if (feedback || hasResponded) {
        return
      }

      const nextFeedback =
        event.code === currentTrial.expectedCode ? 'correct' : 'incorrect'
      setHasResponded(true)
      hasRespondedRef.current = true
      setFeedback(nextFeedback)
      setLastFeedback(nextFeedback)
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentTrial, feedback, hasResponded, isComplete])

  useEffect(() => {
    return () => {
      clearTrialTimeout()
    }
  }, [clearTrialTimeout])

  useEffect(() => {
    if (!isComplete || hasNotifiedCompleteRef.current) {
      return
    }

    hasNotifiedCompleteRef.current = true
    onPracticeComplete?.()
  }, [isComplete, onPracticeComplete])

  if (isComplete) {
    return (
      <section className="practice-game" aria-labelledby="practice-complete-title">
        <div className="practice-panel">
          <p className="eyebrow">Práctica {gameLabel}</p>
          <h1 id="practice-complete-title">Práctica {gameLabel} completada</h1>
          <p className="description">
            Has terminado los {trialLimit} ensayos de práctica. Esta fase no se
            ha incluido en la puntuación ni se enviará al sistema.
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

        <div className="practice-stimulus" aria-live="assertive">
          {currentTrial.flankerParts ? (
            <span className="practice-flanker" aria-label={currentTrial.stimulus}>
              {currentTrial.flankerParts.map((arrow, index) => (
                <span key={`${arrow}-${index}`}>
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

        {game === 'flanker' && currentTrial.controls.length > 0 && (
          <div className="practice-controls" aria-label={`Controles práctica ${gameLabel}`}>
            {currentTrial.controls.map((control) => (
              <span key={control}>{control}</span>
            ))}
          </div>
        )}

        <p
          aria-live="polite"
          className={`practice-feedback practice-feedback-slot ${
            lastFeedback === 'correct'
              ? 'practice-feedback-slot--correct'
              : lastFeedback
                ? 'practice-feedback-slot--error'
                : ''
          }`}
          data-testid={`${game}-practice-feedback`}
          role="status"
        >
          {getPracticeFeedbackText(lastFeedback)}
        </p>
      </div>
    </section>
  )
}
