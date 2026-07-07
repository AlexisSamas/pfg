import { createContext } from 'react'
import type { GameEvent, GameType, ScoringResult, WaitResponse } from '../types'

export const DEFAULT_CONTEXT_ID = 'exam_test_11'

export type CurrentGame = GameType | 'completed' | null

export type StartEvaluationPayload = {
  sessionId: number
  attemptNumber: number
  contextId?: string
}

export type EvaluationContextValue = {
  contextId: string
  sessionId: number | null
  attemptNumber: number | null
  accumulatedEvents: GameEvent[]
  currentGame: CurrentGame
  result: ScoringResult | null
  waitInfo: WaitResponse | null
  startEvaluation: (payload: StartEvaluationPayload) => void
  addEvents: (events: GameEvent[]) => void
  clearEvaluation: () => void
  setCurrentGame: (currentGame: CurrentGame) => void
  setResult: (result: ScoringResult | null) => void
  setWaitInfo: (waitInfo: WaitResponse | null) => void
}

export const EvaluationContext = createContext<
  EvaluationContextValue | undefined
>(undefined)
