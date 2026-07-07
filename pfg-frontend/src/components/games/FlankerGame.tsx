import { useEffect, useRef, useState } from 'react'
import { useEvaluation } from '../../context'
import type { GameEvent } from '../../types'
import './FlankerGame.css'
import {
  createFlankerStimulus,
  type Direction,
  type FlankerPattern,
  type FlankerStimulusType,
  type GeneratedFlankerStimulus,
} from './stimulusGenerators'

type FlankerEventType = 'hit' | 'error' | 'timeout'

type FlankerEvent = GameEvent & {
  game_type: 'flanker'
  event_type: FlankerEventType
  stimulus_type: FlankerStimulusType
}

type FlankerStimulus = GeneratedFlankerStimulus

type FlankerGameProps = {
  durationMs?: number
  trialMs?: number
  incongruentProbability?: number
  onComplete?: (events: GameEvent[]) => void
}

function toTimestampUs(timestampMs: number): number {
  return Math.round(timestampMs * 1000)
}

function keyToDirection(code: string): Direction | null {
  if (code === 'ArrowLeft') {
    return 'left'
  }

  if (code === 'ArrowRight') {
    return 'right'
  }

  return null
}

function directionToArrow(direction: Direction): string {
  return direction === 'left' ? '<' : '>'
}

export function FlankerGame({
  durationMs = 15_000,
  trialMs = 1_000,
  incongruentProbability = 0.5,
  onComplete,
}: FlankerGameProps) {
  const { addEvents } = useEvaluation()
  const [stimulus, setStimulus] = useState<FlankerStimulus | null>(null)
  const [timeRemainingMs, setTimeRemainingMs] = useState(durationMs)
  const [isFinished, setIsFinished] = useState(false)

  const eventsRef = useRef<GameEvent[]>([])
  const stimulusRef = useRef<FlankerStimulus | null>(null)
  const trialTimeoutRef = useRef<number | null>(null)
  const countdownRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const finishedRef = useRef(false)
  const trialIndexRef = useRef(0)
  const previousPatternRef = useRef<FlankerPattern | null>(null)
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

    function recordEvent(event: FlankerEvent) {
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
      eventType: FlankerEventType,
      isCorrect: boolean,
      reactionTimeMs: number | null,
    ): FlankerEvent | null {
      const currentStimulus = stimulusRef.current

      if (!currentStimulus) {
        return null
      }

      const now = performance.now()

      return {
        game_type: 'flanker',
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

      const nextStimulus = createFlankerStimulus(
        incongruentProbability,
        previousPatternRef.current,
      )
      previousPatternRef.current = {
        arrows: nextStimulus.arrows,
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
      const selectedDirection = keyToDirection(event.code)

      if (!selectedDirection) {
        return
      }

      const currentStimulus = stimulusRef.current

      if (!currentStimulus || currentStimulus.responded || finishedRef.current) {
        return
      }

      event.preventDefault()
      currentStimulus.responded = true

      const now = performance.now()
      const isCorrect = selectedDirection === currentStimulus.targetDirection
      const flankerEvent = createEvent(
        isCorrect ? 'hit' : 'error',
        isCorrect,
        Math.round(now - currentStimulus.startedAt),
      )

      if (flankerEvent) {
        recordEvent(flankerEvent)
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
  }, [addEvents, durationMs, incongruentProbability, trialMs])

  return (
    <section className="flanker-game" aria-labelledby="flanker-title">
      <div className="flanker-header">
        <p className="eyebrow">Flanker</p>
        <h1 id="flanker-title">Tarea de flecha central</h1>
      </div>

      <div className="flanker-status" aria-live="polite">
        <span>Tiempo restante: {Math.ceil(timeRemainingMs / 1000)} s</span>
      </div>

      <div className="flanker-arrows" aria-live="assertive">
        {isFinished || !stimulus
          ? 'Fin'
          : stimulus.arrows.map((direction, index) => (
              <span key={`${direction}-${index}`}>
                {directionToArrow(direction)}
              </span>
            ))}
      </div>

      {isFinished && (
        <p className="form-message success-message" role="status">
          Flanker finalizado. Los eventos se han guardado en la evaluación.
        </p>
      )}
    </section>
  )
}
