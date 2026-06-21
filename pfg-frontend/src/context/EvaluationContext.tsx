import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { GameEvent, ScoringResult, WaitResponse } from '../types'
import {
  DEFAULT_CONTEXT_ID,
  EvaluationContext,
  type CurrentGame,
  type EvaluationContextValue,
  type StartEvaluationPayload,
} from './evaluation-context'

type EvaluationProviderProps = {
  children: ReactNode
}

export function EvaluationProvider({ children }: EvaluationProviderProps) {
  const [contextId, setContextId] = useState(DEFAULT_CONTEXT_ID)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [attemptNumber, setAttemptNumber] = useState<number | null>(null)
  const [accumulatedEvents, setAccumulatedEvents] = useState<GameEvent[]>([])
  const [currentGame, setCurrentGame] = useState<CurrentGame>(null)
  const [result, setResult] = useState<ScoringResult | null>(null)
  const [waitInfo, setWaitInfo] = useState<WaitResponse | null>(null)

  const startEvaluation = useCallback((payload: StartEvaluationPayload) => {
    setContextId(payload.contextId ?? DEFAULT_CONTEXT_ID)
    setSessionId(payload.sessionId)
    setAttemptNumber(payload.attemptNumber)
    setAccumulatedEvents([])
    setCurrentGame('cpt')
    setResult(null)
    setWaitInfo(null)
  }, [])

  const addEvents = useCallback((events: GameEvent[]) => {
    setAccumulatedEvents((currentEvents) => [...currentEvents, ...events])
  }, [])

  const clearEvaluation = useCallback(() => {
    setContextId(DEFAULT_CONTEXT_ID)
    setSessionId(null)
    setAttemptNumber(null)
    setAccumulatedEvents([])
    setCurrentGame(null)
    setResult(null)
    setWaitInfo(null)
  }, [])

  const value = useMemo<EvaluationContextValue>(
    () => ({
      contextId,
      sessionId,
      attemptNumber,
      accumulatedEvents,
      currentGame,
      result,
      waitInfo,
      startEvaluation,
      addEvents,
      clearEvaluation,
      setCurrentGame,
      setResult,
      setWaitInfo,
    }),
    [
      contextId,
      sessionId,
      attemptNumber,
      accumulatedEvents,
      currentGame,
      result,
      waitInfo,
      startEvaluation,
      addEvents,
      clearEvaluation,
    ],
  )

  return (
    <EvaluationContext.Provider value={value}>
      {children}
    </EvaluationContext.Provider>
  )
}
