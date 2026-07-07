import { useEffect, useRef, useState } from 'react'
import { useEvaluation } from '../../context'
import type { GameEvent } from '../../types'
import './CPTGame.css'
import {
  createInitialCptGenerationState,
  getNextCptLetter,
  TARGET_LETTER,
  type CptGenerationState,
} from './stimulusGenerators'

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

  const eventsRef = useRef<GameEvent[]>([])
  const stimulusRef = useRef<CurrentStimulus | null>(null)
  const timeoutRef = useRef<number | null>(null)
  const countdownRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const finishedRef = useRef(false)
  const stimulusIndexRef = useRef(0)
  const generationStateRef = useRef<CptGenerationState | null>(null)
  const onCompleteRef = useRef(onComplete)

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    startedAtRef.current = performance.now()
    eventsRef.current = []
    finishedRef.current = false
    stimulusIndexRef.current = 0
    generationStateRef.current = createInitialCptGenerationState()

    function recordEvent(event: CPTEvent) {
      eventsRef.current = [...eventsRef.current, event]
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

    function scheduleNextStimulus(stimulusIndex = stimulusIndexRef.current) {
      if (finishedRef.current) {
        return
      }

      const startTime = startedAtRef.current
      const now = performance.now()
      const elapsedMs = now - startTime
      const remainingMs = durationMs - elapsedMs

      if (remainingMs <= 0) {
        finishGame()
        return
      }

      const generationState =
        generationStateRef.current ?? createInitialCptGenerationState()
      const nextLetter = getNextCptLetter(targetProbability, generationState)
      const letter = nextLetter.letter
      generationStateRef.current = nextLetter.state
      const startedAt = performance.now()
      const isTarget = letter === TARGET_LETTER

      stimulusRef.current = {
        letter,
        isTarget,
        startedAt,
        responded: false,
      }
      setCurrentLetter(letter)

      const stimulusDeadlineMs = Math.min(
        startTime + (stimulusIndex + 1) * intervalMs,
        startTime + durationMs,
      )
      const timeoutDelayMs = Math.max(0, stimulusDeadlineMs - performance.now())

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
        stimulusIndexRef.current = stimulusIndex + 1

        if (stimulusDeadlineMs >= startedAtRef.current + durationMs) {
          finishGame()
          return
        }

        scheduleNextStimulus(stimulusIndex + 1)
      }, timeoutDelayMs)
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
      </div>

      <div className="cpt-status" aria-live="polite">
        <span>Tiempo restante: {Math.ceil(timeRemainingMs / 1000)} s</span>
      </div>

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
