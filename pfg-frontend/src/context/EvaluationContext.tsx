import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
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

const EVALUATION_STATE_STORAGE_KEY = 'pfg_evaluation_state'
const EVALUATION_FLOW_STORAGE_KEY = 'pfg_evaluation_flow'

type StoredEvaluationState = {
  contextId: string
  sessionId: number | null
  attemptNumber: number | null
  accumulatedEvents: GameEvent[]
  currentGame: CurrentGame
  result: ScoringResult | null
  waitInfo: WaitResponse | null
}

function readStoredEvaluationState(): StoredEvaluationState | null {
  const rawState = window.sessionStorage.getItem(EVALUATION_STATE_STORAGE_KEY)

  if (!rawState) {
    return null
  }

  try {
    return JSON.parse(rawState) as StoredEvaluationState
  } catch {
    window.sessionStorage.removeItem(EVALUATION_STATE_STORAGE_KEY)
    window.sessionStorage.removeItem(EVALUATION_FLOW_STORAGE_KEY)
    return null
  }
}

export function EvaluationProvider({ children }: EvaluationProviderProps) {
  const [storedEvaluationState] = useState(readStoredEvaluationState)
  const [contextId, setContextId] = useState(
    storedEvaluationState?.contextId ?? DEFAULT_CONTEXT_ID,
  )
  const [sessionId, setSessionId] = useState<number | null>(
    storedEvaluationState?.sessionId ?? null,
  )
  const [attemptNumber, setAttemptNumber] = useState<number | null>(
    storedEvaluationState?.attemptNumber ?? null,
  )
  const [accumulatedEvents, setAccumulatedEvents] = useState<GameEvent[]>(
    storedEvaluationState?.accumulatedEvents ?? [],
  )
  const [currentGame, setCurrentGame] = useState<CurrentGame>(
    storedEvaluationState?.currentGame ?? null,
  )
  const [result, setResult] = useState<ScoringResult | null>(
    storedEvaluationState?.result ?? null,
  )
  const [waitInfo, setWaitInfo] = useState<WaitResponse | null>(
    storedEvaluationState?.waitInfo ?? null,
  )

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
    window.sessionStorage.removeItem(EVALUATION_STATE_STORAGE_KEY)
    window.sessionStorage.removeItem(EVALUATION_FLOW_STORAGE_KEY)
  }, [])

  useEffect(() => {
    if (!sessionId && !currentGame) {
      window.sessionStorage.removeItem(EVALUATION_STATE_STORAGE_KEY)
      window.sessionStorage.removeItem(EVALUATION_FLOW_STORAGE_KEY)
      return
    }

    const stateToStore: StoredEvaluationState = {
      contextId,
      sessionId,
      attemptNumber,
      accumulatedEvents,
      currentGame,
      result,
      waitInfo,
    }

    window.sessionStorage.setItem(
      EVALUATION_STATE_STORAGE_KEY,
      JSON.stringify(stateToStore),
    )
  }, [
    contextId,
    sessionId,
    attemptNumber,
    accumulatedEvents,
    currentGame,
    result,
    waitInfo,
  ])

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
