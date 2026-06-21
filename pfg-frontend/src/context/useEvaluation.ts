import { useContext } from 'react'
import {
  EvaluationContext,
  type EvaluationContextValue,
} from './evaluation-context'

export function useEvaluation(): EvaluationContextValue {
  const context = useContext(EvaluationContext)

  if (!context) {
    throw new Error('useEvaluation must be used within EvaluationProvider')
  }

  return context
}
