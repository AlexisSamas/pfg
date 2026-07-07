import type { AttemptContextClaim, LastEvaluationClaim } from '../types'

export type UserRole = 'student' | 'instructor'

type JwtPayload = {
  attempts_by_context?: AttemptContextClaim[] | null
  last_evaluation?: RawLastEvaluationClaim | null
  role?: string | null
}

type RawLastEvaluationClaim = LastEvaluationClaim & {
  waitUntil?: string | null
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '=',
  )
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))

  return new TextDecoder().decode(bytes)
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const [, payload] = token.split('.')

    if (!payload) {
      return null
    }

    return JSON.parse(decodeBase64Url(payload)) as JwtPayload
  } catch {
    return null
  }
}

export function getLastEvaluationFromToken(
  token: string | null,
): LastEvaluationClaim | null {
  if (!token) {
    return null
  }
  const lastEvaluation = decodeJwtPayload(token)?.last_evaluation

  if (!lastEvaluation) {
    return null
  }

  return {
    ...lastEvaluation,
    wait_until:
      typeof lastEvaluation.wait_until === 'string'
        ? lastEvaluation.wait_until
        : lastEvaluation.waitUntil ?? null,
  }
}

export function getAttemptContextFromToken(
  token: string | null,
  contextId: string,
): AttemptContextClaim | null {
  if (!token) {
    return null
  }

  const attemptsByContext = decodeJwtPayload(token)?.attempts_by_context

  if (!Array.isArray(attemptsByContext)) {
    return null
  }

  return (
    attemptsByContext.find((attempts) => attempts.context_id === contextId) ??
    null
  )
}

export function getUserRoleFromToken(token: string | null): UserRole | null {
  if (!token) {
    return null
  }

  const role = decodeJwtPayload(token)?.role

  return role === 'student' || role === 'instructor' ? role : null
}
