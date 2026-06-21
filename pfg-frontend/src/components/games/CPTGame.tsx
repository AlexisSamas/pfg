import { useEffect, useRef, useState } from 'react'
import { useEvaluation } from '../../context'
import type { GameEvent } from '../../types'
import './CPTGame.css'

const TARGET_LETTER = 'X'
const NON_TARGET_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWYZ'.split('')

type CPTGameProps = {
  durationMs?: number
  intervalMs?: number
  targetProbability?: number
  onComplete?: (events: GameEvent[]) => void
}

type CurrentStimulus = {
  letter: string
  isTarget: boolean
  startedAt: number
  responded: boolean
}

type CPTEventCounts = {
  hit: number
  miss: number
  false_alarm: number
  correct_rejection: number
}

type CPTEventType = keyof CPTEventCounts

type CPTEvent = GameEvent & {
  game_type: 'cpt'
  event_type: CPTEventType
  stimulus_type: 'target' | 'non_target'
}

const INITIAL_EVENT_COUNTS: CPTEventCounts = {
  hit: 0,
  miss: 0,
  false_alarm: 0,
  correct_rejection: 0,
}

function getRandomLetter(targetProbability: number): string {
  if (Math.random() < targetProbability) {
    return TARGET_LETTER
  }

  const index = Math.floor(Math.random() * NON_TARGET_LETTERS.length)

  return NON_TARGET_LETTERS[index]
}

function toTimestampUs(timestampMs: number): number {
  return Math.round(timestampMs * 1000)
}

export function CPTGame({
  durationMs = 15_000,
  intervalMs = 1_000,
  targetProbability = 0.25,
  onComplete,
}: CPTGameProps) {
  const { addEvents } = useEvaluation()
  const [currentLetter, setCurrentLetter] = useState<string | null>(null)
  const [timeRemainingMs, setTimeRemainingMs] = useState(durationMs)
  const [isFinished, setIsFinished] = useState(false)
  const [eventCount, setEventCount] = useState(0)
  const [eventCounts, setEventCounts] =
    useState<CPTEventCounts>(INITIAL_EVENT_COUNTS)

  const eventsRef = useRef<GameEvent[]>([])
  const stimulusRef = useRef<CurrentStimulus | null>(null)
  const timeoutRef = useRef<number | null>(null)
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

    function recordEvent(event: CPTEvent) {
      eventsRef.current = [...eventsRef.current, event]
      setEventCount(eventsRef.current.length)
      setEventCounts((currentCounts) => ({
        ...currentCounts,
        [event.event_type]: currentCounts[event.event_type] + 1,
      }))
      addEvents([event])
    }

    function finishGame() {
      if (finishedRef.current) {
        return
      }

      finishedRef.current = true
      stimulusRef.current = null
      setCurrentLetter(null)
      setTimeRemainingMs(0)
      setIsFinished(true)
      onCompleteRef.current?.(eventsRef.current)
    }

    function createEvent(
      eventType: CPTEventType,
      isCorrect: boolean,
      reactionTimeMs: number | null,
    ): CPTEvent | null {
      const stimulus = stimulusRef.current

      if (!stimulus) {
        return null
      }

      const now = performance.now()

      return {
        game_type: 'cpt',
        event_type: eventType,
        timestamp_us: toTimestampUs(now),
        reaction_time_ms: reactionTimeMs,
        is_correct: isCorrect,
        stimulus_type: stimulus.isTarget ? 'target' : 'non_target',
      }
    }

    function scheduleNextStimulus() {
      if (finishedRef.current) {
        return
      }

      const elapsedMs = performance.now() - startedAtRef.current
      const remainingMs = durationMs - elapsedMs

      if (remainingMs <= 0) {
        finishGame()
        return
      }

      const letter = getRandomLetter(targetProbability)
      const startedAt = performance.now()
      const isTarget = letter === TARGET_LETTER

      stimulusRef.current = {
        letter,
        isTarget,
        startedAt,
        responded: false,
      }
      setCurrentLetter(letter)

      timeoutRef.current = window.setTimeout(() => {
        const stimulus = stimulusRef.current

        if (stimulus && !stimulus.responded) {
          const event = createEvent(
            stimulus.isTarget ? 'miss' : 'correct_rejection',
            !stimulus.isTarget,
            null,
          )

          if (event) {
            recordEvent(event)
          }
        }

        stimulusRef.current = null
        scheduleNextStimulus()
      }, Math.min(intervalMs, remainingMs))
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== 'Space') {
        return
      }

      const stimulus = stimulusRef.current

      if (!stimulus || stimulus.responded || finishedRef.current) {
        return
      }

      event.preventDefault()
      stimulus.responded = true

      const now = performance.now()
      const reactionTimeMs = Math.round(now - stimulus.startedAt)
      const cptEvent = createEvent(
        stimulus.isTarget ? 'hit' : 'false_alarm',
        stimulus.isTarget,
        reactionTimeMs,
      )

      if (cptEvent) {
        recordEvent(cptEvent)
      }
    }

    countdownRef.current = window.setInterval(() => {
      const elapsedMs = performance.now() - startedAtRef.current
      setTimeRemainingMs(Math.max(0, durationMs - elapsedMs))
    }, 200)

    window.addEventListener('keydown', handleKeyDown)
    scheduleNextStimulus()

    return () => {
      window.removeEventListener('keydown', handleKeyDown)

      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
      }

      if (countdownRef.current !== null) {
        window.clearInterval(countdownRef.current)
      }
    }
  }, [addEvents, durationMs, intervalMs, targetProbability])

  return (
    <section className="cpt-game" aria-labelledby="cpt-title">
      <div className="cpt-header">
        <p className="eyebrow">CPT</p>
        <h1 id="cpt-title">Tarea de atención sostenida</h1>
        <p className="description">
          Pulsa la barra espaciadora solo cuando aparezca la letra X.
        </p>
      </div>

      <div className="cpt-status" aria-live="polite">
        <span>Tiempo restante: {Math.ceil(timeRemainingMs / 1000)} s</span>
        <span>Eventos generados: {eventCount}</span>
      </div>

      <dl className="cpt-event-counts" aria-label="Eventos CPT acumulados">
        <div>
          <dt>hit</dt>
          <dd>{eventCounts.hit}</dd>
        </div>
        <div>
          <dt>miss</dt>
          <dd>{eventCounts.miss}</dd>
        </div>
        <div>
          <dt>false_alarm</dt>
          <dd>{eventCounts.false_alarm}</dd>
        </div>
        <div>
          <dt>correct_rejection</dt>
          <dd>{eventCounts.correct_rejection}</dd>
        </div>
      </dl>

      <div className="letter-display" aria-live="assertive">
        {isFinished ? 'Fin' : currentLetter}
      </div>

      {isFinished && (
        <p className="form-message success-message" role="status">
          CPT finalizado. Los eventos se han guardado en la evaluación.
        </p>
      )}
    </section>
  )
}
