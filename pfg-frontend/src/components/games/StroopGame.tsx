import { useEffect, useMemo, useRef, useState } from 'react'
import { useEvaluation } from '../../context'
import type { GameEvent } from '../../types'
import './StroopGame.css'
import {
  getAvailableStroopColors,
  keyToStroopColor,
  STROOP_COLORS,
  type ColorBlindMode,
} from './stroopColors'
import {
  createStroopStimulus,
  type GeneratedStroopStimulus,
  type StroopPattern,
  type StroopStimulusType,
} from './stimulusGenerators'

type StroopEventType = 'correct' | 'error' | 'timeout'

type StroopEvent = GameEvent & {
  game_type: 'stroop'
  event_type: StroopEventType
  stimulus_type: StroopStimulusType
}

type StroopStimulus = GeneratedStroopStimulus

type StroopGameProps = {
  durationMs?: number
  trialMs?: number
  incongruentProbability?: number
  colorBlindMode?: ColorBlindMode
  onComplete?: (events: GameEvent[]) => void
}

function toTimestampUs(timestampMs: number): number {
  return Math.round(timestampMs * 1000)
}

export function StroopGame({
  durationMs = 15_000,
  trialMs = 1_000,
  incongruentProbability = 0.5,
  colorBlindMode,
  onComplete,
}: StroopGameProps) {
  const { addEvents } = useEvaluation()
  const availableColors = useMemo(
    () => getAvailableStroopColors(colorBlindMode),
    [colorBlindMode],
  )
  const [stimulus, setStimulus] = useState<StroopStimulus | null>(null)
  const [timeRemainingMs, setTimeRemainingMs] = useState(durationMs)
  const [isFinished, setIsFinished] = useState(false)

  const eventsRef = useRef<GameEvent[]>([])
  const stimulusRef = useRef<StroopStimulus | null>(null)
  const trialTimeoutRef = useRef<number | null>(null)
  const countdownRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const finishedRef = useRef(false)
  const trialIndexRef = useRef(0)
  const previousPatternRef = useRef<StroopPattern | null>(null)
  const onCompleteRef = useRef(onComplete)

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    startedAtRef.current = performance.now()
    eventsRef.current = []
    finishedRef.current = false
    trialIndexRef.current = 0
    previousPatternRef.current = null

    function recordEvent(event: StroopEvent) {
      eventsRef.current = [...eventsRef.current, event]
      addEvents([event])
    }

    function finishGame() {
      if (finishedRef.current) {
        return
      }

      finishedRef.current = true
      stimulusRef.current = null
      setStimulus(null)
      setTimeRemainingMs(0)
      setIsFinished(true)
      onCompleteRef.current?.(eventsRef.current)
    }

    function createEvent(
      eventType: StroopEventType,
      isCorrect: boolean,
      reactionTimeMs: number | null,
    ): StroopEvent | null {
      const currentStimulus = stimulusRef.current

      if (!currentStimulus) {
        return null
      }

      const now = performance.now()

      return {
        game_type: 'stroop',
        event_type: eventType,
        timestamp_us: toTimestampUs(now),
        reaction_time_ms: reactionTimeMs,
        is_correct: isCorrect,
        stimulus_type: currentStimulus.stimulusType,
      }
    }

    function scheduleNextTrial(trialIndex = trialIndexRef.current) {
      if (finishedRef.current) {
        return
      }

      const startTime = startedAtRef.current
      const elapsedMs = performance.now() - startTime
      const remainingMs = durationMs - elapsedMs

      if (remainingMs <= 0) {
        finishGame()
        return
      }

      const nextStimulus = createStroopStimulus(
        incongruentProbability,
        availableColors,
        previousPatternRef.current,
      )
      previousPatternRef.current = {
        word: nextStimulus.word,
        ink: nextStimulus.ink,
      }
      stimulusRef.current = nextStimulus
      setStimulus(nextStimulus)

      const trialDeadlineMs = Math.min(
        startTime + (trialIndex + 1) * trialMs,
        startTime + durationMs,
      )
      const timeoutDelayMs = Math.max(0, trialDeadlineMs - performance.now())

      trialTimeoutRef.current = window.setTimeout(() => {
        const currentStimulus = stimulusRef.current

        if (currentStimulus && !currentStimulus.responded) {
          const timeoutEvent = createEvent('timeout', false, null)

          if (timeoutEvent) {
            recordEvent(timeoutEvent)
          }
        }

        stimulusRef.current = null
        trialIndexRef.current = trialIndex + 1

        if (trialDeadlineMs >= startedAtRef.current + durationMs) {
          finishGame()
          return
        }

        scheduleNextTrial(trialIndex + 1)
      }, timeoutDelayMs)
    }

    function handleKeyDown(event: KeyboardEvent) {
      const selectedColor = keyToStroopColor(event.code, availableColors)

      if (!selectedColor) {
        return
      }

      const currentStimulus = stimulusRef.current

      if (!currentStimulus || currentStimulus.responded || finishedRef.current) {
        return
      }

      event.preventDefault()
      currentStimulus.responded = true

      const now = performance.now()
      const isCorrect = selectedColor === currentStimulus.ink
      const stroopEvent = createEvent(
        isCorrect ? 'correct' : 'error',
        isCorrect,
        Math.round(now - currentStimulus.startedAt),
      )

      if (stroopEvent) {
        recordEvent(stroopEvent)
      }
    }

    countdownRef.current = window.setInterval(() => {
      const elapsedMs = performance.now() - startedAtRef.current
      setTimeRemainingMs(Math.max(0, durationMs - elapsedMs))
    }, 200)

    window.addEventListener('keydown', handleKeyDown)
    scheduleNextTrial()

    return () => {
      window.removeEventListener('keydown', handleKeyDown)

      if (trialTimeoutRef.current !== null) {
        window.clearTimeout(trialTimeoutRef.current)
      }

      if (countdownRef.current !== null) {
        window.clearInterval(countdownRef.current)
      }
    }
  }, [addEvents, availableColors, durationMs, incongruentProbability, trialMs])

  return (
    <section className="stroop-game" aria-labelledby="stroop-title">
      <div className="stroop-header">
        <p className="eyebrow">Stroop</p>
        <h1 id="stroop-title">Tarea de color e inhibición</h1>
      </div>

      <div className="stroop-status" aria-live="polite">
        <span>Tiempo restante: {Math.ceil(timeRemainingMs / 1000)} s</span>
      </div>

      <div className="stroop-word" aria-live="assertive">
        {isFinished || !stimulus ? (
          'Fin'
        ) : (
          <span style={{ color: STROOP_COLORS[stimulus.ink].cssColor }}>
            {STROOP_COLORS[stimulus.word].label}
          </span>
        )}
      </div>

      {isFinished && (
        <p className="form-message success-message" role="status">
          Stroop finalizado. Los eventos se han guardado en la evaluación.
        </p>
      )}
    </section>
  )
}
