export type AuthToken = {
  access_token: string
  token_type: 'bearer' | string
}

export type LastEvaluationClaim = {
  session_id: number
  context_id: string
  score: number | null
  decision: Decision
  weakest_metric: string | null
  recommendation_key: string | null
  computed_at: string | null
  wait_until: string | null
  requires_manual_grant: boolean
  manual_grant: boolean
}

export type LoginRequest = {
  username: string
  password: string
}

export type SessionStatus =
  | 'created'
  | 'active'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type SessionCreate = {
  context_id: string
}

export type SessionResponse = {
  id: number
  user_id: number
  context_id: string
  attempt_number: number
  started_at: string
  completed_at: string | null
  status: SessionStatus
}

export type Decision = 'ACCESO' | 'ESPERA' | 'BLOQUEO'

export type GameType = 'cpt' | 'stroop' | 'flanker'

export type EventType =
  | 'hit'
  | 'miss'
  | 'false_alarm'
  | 'correct_rejection'
  | 'correct'
  | 'error'
  | 'timeout'

export type StimulusType =
  | 'target'
  | 'non_target'
  | 'congruent'
  | 'incongruent'
  | null

export type GameEvent = {
  game_type: GameType
  event_type: EventType
  timestamp_us: number
  reaction_time_ms: number | null
  is_correct: boolean | null
  stimulus_type: StimulusType
}

export type GameEventBatch = {
  events: GameEvent[]
}

export type ScoringResult = {
  id: number
  session_id: number
  trm_ms: number | null
  d_prime: number | null
  stroop_effect_ms: number | null
  flanker_effect_ms: number | null
  stroop_error_rate: number | null
  flanker_accuracy: number | null
  score: number | null
  decision: Decision
  weakest_metric: string | null
  recommendation_key: string | null
  computed_at: string
  new_access_token?: string | null
}

export type DecisionResponse = {
  session_id: number | null
  context_id: string
  decision: Decision
  score: number | null
}

export type WaitResponse = {
  wait_until: string
  recommendation_key: string | null
  reason: string | null
}

export type DashboardUserStatus = {
  user_id: number | null
  username: string | null
  email: string | null
  context_id: string
  latest_session_id: number | null
  latest_attempt_number: number | null
  latest_status: SessionStatus | string | null
  latest_score: number | null
  latest_decision: Decision | null
  weakest_metric: string | null
  recommendation_key: string | null
  wait_until: string | null
  manual_grant: boolean
  updated_at?: string | null
  computed_at?: string | null
}

export type ManualGrantRequest = {
  user_id: number
  context_id: string
  reason: string
}

export type ManualGrantResponse = {
  granted: boolean
  user_id: number
  context_id: string
  decision: Decision
}
