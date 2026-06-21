import type {
  AuthToken,
  DecisionResponse,
  DashboardUserStatus,
  GameEventBatch,
  LoginRequest,
  ManualGrantRequest,
  ManualGrantResponse,
  ScoringResult,
  SessionCreate,
  SessionResponse,
  WaitResponse,
} from '../types'
import { apiClient } from './client'

export { API_TOKEN_STORAGE_KEY, apiClient, getStoredToken } from './client'

export async function login(credentials: LoginRequest): Promise<AuthToken> {
  const response = await apiClient.post<AuthToken>('/auth/token', credentials)

  return response.data
}

export async function createSession(
  payload: SessionCreate,
): Promise<SessionResponse> {
  const response = await apiClient.post<SessionResponse>('/sessions', payload)

  return response.data
}

export async function sendEvents(
  sessionId: number | string,
  payload: GameEventBatch,
): Promise<{ received: number }> {
  const response = await apiClient.post<{ received: number }>(
    `/sessions/${sessionId}/events`,
    payload,
  )

  return response.data
}

export async function getResult(
  sessionId: number | string,
): Promise<ScoringResult> {
  const response = await apiClient.get<ScoringResult>(
    `/sessions/${sessionId}/result`,
  )

  return response.data
}

export async function getDecision(
  sessionId: number | string,
): Promise<DecisionResponse> {
  const response = await apiClient.get<DecisionResponse>(
    `/sessions/${sessionId}/decision`,
  )

  return response.data
}

export async function getWait(sessionId: number | string): Promise<WaitResponse> {
  const response = await apiClient.get<WaitResponse>(
    `/sessions/${sessionId}/wait`,
  )

  return response.data
}

export async function getDashboardContext(
  ctxId: string,
): Promise<DashboardUserStatus[]> {
  const response = await apiClient.get<DashboardUserStatus[]>(
    `/dashboard/context/${encodeURIComponent(ctxId)}`,
  )

  return response.data
}

export async function grantManualAccess(
  payload: ManualGrantRequest,
): Promise<ManualGrantResponse> {
  const response = await apiClient.post<ManualGrantResponse>(
    '/dashboard/grant-manual',
    payload,
  )

  return response.data
}
