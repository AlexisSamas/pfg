import { useEffect, useMemo, useRef, useState } from 'react'
import { useEvaluation } from '../../context'
import type { GameEvent } from '../../types'
import './StroopGame.css'
import {
  getAvailableStroopColors,
  getDifferentStroopColor,
  keyToStroopColor,
  STROOP_COLORS,
  type ColorBlindMode,
  type StroopColorKey,
} from './stroopColors'

type StroopEventType = 'correct' | 'error' | 'timeout'
type StroopStimulusType = 'congruent' | 'incongruent'

type StroopEventCounts = {
  correct: number
  error: number
  timeout: number
  congruent: number
  incongruent: number
}

type StroopEvent = GameEvent & {
  game_type: 'stroop'
  event_type: StroopEventType
  stimulus_type: StroopStimulusType
}

type StroopStimulus = {
  word: StroopColorKey
  ink: StroopColorKey
  stimulusType: StroopStimulusType
  startedAt: number
  responded: boolean
}

type StroopGameProps = {
  durationMs?: number
  trialMs?: number
  incongruentProbability?: number
  colorBlindMode?: ColorBlindMode
  onComplete?: (events: GameEvent[]) => void
}

const INITIAL_COUNTS: StroopEventCounts = {
  correct: 0,
  error: 0,
  timeout: 0,
  congruent: 0,
  incongruent: 0,
}

function getRandomColor(availableColors: StroopColorKey[]): StroopColorKey {
  const index = Math.floor(Math.random() * availableColors.length)

  return availableColors[index]
}

function createStimulus(
  incongruentProbability: number,
  availableColors: StroopColorKey[],
): StroopStimulus {
  const word = getRandomColor(availableColors)
  const isIncongruent = Math.random() < incongruentProbability
  const ink = isIncongruent
    ? getDifferentStroopColor(word, availableColors)
    : word

  return {
    word,
    ink,
    stimulusType: isIncongruent ? 'incongruent' : 'congruent',
    startedAt: performance.now(),
    responded: false,
  }
}

function toTimestampUs(timestampMs: number): number {
  return Math.round(timestampMs * 1000)
}

export function StroopGame({
  durationMs = 15_000,
  trialMs = 1_500,
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
  const [eventCount, setEventCount] = useState(0)
  const [counts, setCounts] = useState<StroopEventCounts>(INITIAL_COUNTS)

  const eventsRef = useRef<GameEvent[]>([])
  const stimulusRef = useRef<StroopStimulus | null>(null)
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

    function recordEvent(event: StroopEvent) {
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

      const nextStimulus = createStimulus(incongruentProbability, availableColors)
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
        <p className="description">
          Responde al color de la tinta, no al texto de la palabra.
        </p>
      </div>

      <div className="stroop-status" aria-live="polite">
        <span>Tiempo restante: {Math.ceil(timeRemainingMs / 1000)} s</span>
        <span>Eventos generados: {eventCount}</span>
      </div>

      <dl className="stroop-counts" aria-label="Eventos Stroop acumulados">
        <div>
          <dt>correct</dt>
          <dd>{counts.correct}</dd>
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

      <div className="stroop-word" aria-live="assertive">
        {isFinished || !stimulus ? (
          'Fin'
        ) : (
          <span style={{ color: STROOP_COLORS[stimulus.ink].cssColor }}>
            {STROOP_COLORS[stimulus.word].label}
          </span>
        )}
      </div>

      <div className="stroop-controls" aria-label="Controles Stroop">
        {availableColors.map((color) => (
          <span key={color}>{STROOP_COLORS[color].controlLabel}</span>
        ))}
      </div>

      {isFinished && (
        <p className="form-message success-message" role="status">
          Stroop finalizado. Los eventos se han guardado en la evaluación.
        </p>
      )}
    </section>
  )
}
