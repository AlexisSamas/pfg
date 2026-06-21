import { useEffect, useRef, useState } from 'react'
import { useEvaluation } from '../../context'
import type { GameEvent } from '../../types'
import './FlankerGame.css'

type Direction = 'left' | 'right'
type FlankerEventType = 'hit' | 'error' | 'timeout'
type FlankerStimulusType = 'congruent' | 'incongruent'

type FlankerEventCounts = {
  hit: number
  error: number
  timeout: number
  congruent: number
  incongruent: number
}

type FlankerEvent = GameEvent & {
  game_type: 'flanker'
  event_type: FlankerEventType
  stimulus_type: FlankerStimulusType
}

type FlankerStimulus = {
  arrows: Direction[]
  targetDirection: Direction
  stimulusType: FlankerStimulusType
  startedAt: number
  responded: boolean
}

type FlankerGameProps = {
  durationMs?: number
  trialMs?: number
  incongruentProbability?: number
  onComplete?: (events: GameEvent[]) => void
}

const INITIAL_COUNTS: FlankerEventCounts = {
  hit: 0,
  error: 0,
  timeout: 0,
  congruent: 0,
  incongruent: 0,
}

function getRandomDirection(): Direction {
  return Math.random() < 0.5 ? 'left' : 'right'
}

function getOppositeDirection(direction: Direction): Direction {
  return direction === 'left' ? 'right' : 'left'
}

function createStimulus(incongruentProbability: number): FlankerStimulus {
  const targetDirection = getRandomDirection()
  const isIncongruent = Math.random() < incongruentProbability
  const flankDirection = isIncongruent
    ? getOppositeDirection(targetDirection)
    : targetDirection

  return {
    arrows: [
      flankDirection,
      flankDirection,
      targetDirection,
      flankDirection,
      flankDirection,
    ],
    targetDirection,
    stimulusType: isIncongruent ? 'incongruent' : 'congruent',
    startedAt: performance.now(),
    responded: false,
  }
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
  return direction === 'left' ? '←' : '→'
}

export function FlankerGame({
  durationMs = 15_000,
  trialMs = 1_500,
  incongruentProbability = 0.5,
  onComplete,
}: FlankerGameProps) {
  const { addEvents } = useEvaluation()
  const [stimulus, setStimulus] = useState<FlankerStimulus | null>(null)
  const [timeRemainingMs, setTimeRemainingMs] = useState(durationMs)
  const [isFinished, setIsFinished] = useState(false)
  const [eventCount, setEventCount] = useState(0)
  const [counts, setCounts] = useState<FlankerEventCounts>(INITIAL_COUNTS)

  const eventsRef = useRef<GameEvent[]>([])
  const stimulusRef = useRef<FlankerStimulus | null>(null)
  const trialTimeoutRef = useRef<number | null>(null)
  const countdownRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const finishedRef = useRef(false)
  const onCompleteRef = useRef(onComplete)

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    startedAtRef.current = performance.now()
    eventsRef.current = []
    finishedRef.current = false

    function recordEvent(event: FlankerEvent) {
      eventsRef.current = [...eventsRef.current, event]
      setEventCount(eventsRef.current.length)
      setCounts((currentCounts) => ({
        ...currentCounts,
        [event.event_type]: currentCounts[event.event_type] + 1,
        [event.stimulus_type]: currentCounts[event.stimulus_type] + 1,
      }))
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

    function scheduleNextTrial() {
      if (finishedRef.current) {
        return
      }

      const elapsedMs = performance.now() - startedAtRef.current
      const remainingMs = durationMs - elapsedMs

      if (remainingMs <= 0) {
        finishGame()
        return
      }

      const nextStimulus = createStimulus(incongruentProbability)
      stimulusRef.current = nextStimulus
      setStimulus(nextStimulus)

      trialTimeoutRef.current = window.setTimeout(() => {
        const currentStimulus = stimulusRef.current

        if (currentStimulus && !currentStimulus.responded) {
          const timeoutEvent = createEvent('timeout', false, null)

          if (timeoutEvent) {
            recordEvent(timeoutEvent)
          }
        }

        stimulusRef.current = null
        scheduleNextTrial()
      }, Math.min(trialMs, remainingMs))
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
        <p className="description">
          Responde únicamente a la dirección de la flecha central.
        </p>
      </div>

      <div className="flanker-status" aria-live="polite">
        <span>Tiempo restante: {Math.ceil(timeRemainingMs / 1000)} s</span>
        <span>Eventos generados: {eventCount}</span>
      </div>

      <dl className="flanker-counts" aria-label="Eventos Flanker acumulados">
        <div>
          <dt>hit</dt>
          <dd>{counts.hit}</dd>
        </div>
        <div>
          <dt>error</dt>
          <dd>{counts.error}</dd>
        </div>
        <div>
          <dt>timeout</dt>
          <dd>{counts.timeout}</dd>
        </div>
        <div>
          <dt>congruent</dt>
          <dd>{counts.congruent}</dd>
        </div>
        <div>
          <dt>incongruent</dt>
          <dd>{counts.incongruent}</dd>
        </div>
      </dl>

      <div className="flanker-arrows" aria-live="assertive">
        {isFinished || !stimulus
          ? 'Fin'
          : stimulus.arrows.map((direction, index) => (
              <span
                className={index === 2 ? 'central-arrow' : undefined}
                key={`${direction}-${index}`}
              >
                {directionToArrow(direction)}
              </span>
            ))}
      </div>

      <div className="flanker-controls" aria-label="Controles Flanker">
        <span>ArrowLeft = izquierda</span>
        <span>ArrowRight = derecha</span>
      </div>

      {isFinished && (
        <p className="form-message success-message" role="status">
          Flanker finalizado. Los eventos se han guardado en la evaluación.
        </p>
      )}
    </section>
  )
}
