import { describe, expect, it } from 'vitest'
import {
  decodeJwtPayload,
  getAttemptContextFromToken,
  getLastEvaluationFromToken,
  getUserRoleFromToken,
} from './jwt'

function createUnsignedToken(payload: unknown): string {
  const encodedPayload = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

  return `header.${encodedPayload}.signature`
}

describe('jwt utilities', () => {
  it('decodeJwtPayload decodifica claims del payload', () => {
    const token = createUnsignedToken({
      sub: '1',
      last_evaluation: {
        session_id: 10,
        context_id: 'exam_demo_01',
        score: 75,
        decision: 'ACCESO',
        weakest_metric: null,
        recommendation_key: 'none',
        computed_at: '2026-06-10T10:00:00',
        wait_until: null,
        requires_manual_grant: false,
        manual_grant: false,
      },
    })

    expect(decodeJwtPayload(token)?.last_evaluation?.score).toBe(75)
  })

  it('getLastEvaluationFromToken devuelve null con token malformado', () => {
    expect(getLastEvaluationFromToken('bad-token')).toBeNull()
  })

  it('getLastEvaluationFromToken normaliza waitUntil como wait_until', () => {
    const token = createUnsignedToken({
      last_evaluation: {
        session_id: 10,
        context_id: 'exam_demo_01',
        score: 57,
        decision: 'ESPERA',
        weakest_metric: null,
        recommendation_key: 'low_dprime',
        computed_at: '2026-06-10T10:00:00',
        wait_until: null,
        waitUntil: '2026-06-18T10:01:05Z',
        requires_manual_grant: false,
        manual_grant: false,
      },
    })

    expect(getLastEvaluationFromToken(token)?.wait_until).toBe(
      '2026-06-18T10:01:05Z',
    )
  })

  it('getUserRoleFromToken devuelve el rol del usuario', () => {
    expect(getUserRoleFromToken(createUnsignedToken({ role: 'student' }))).toBe(
      'student',
    )
    expect(
      getUserRoleFromToken(createUnsignedToken({ role: 'instructor' })),
    ).toBe('instructor')
  })

  it('getAttemptContextFromToken devuelve intentos del contexto actual', () => {
    const token = createUnsignedToken({
      attempts_by_context: [
        { context_id: 'exam_a', attempt_count: 3, max_attempts: 3 },
        { context_id: 'exam_b', attempt_count: 1, max_attempts: 3 },
      ],
    })

    expect(getAttemptContextFromToken(token, 'exam_a')).toEqual({
      context_id: 'exam_a',
      attempt_count: 3,
      max_attempts: 3,
    })
    expect(getAttemptContextFromToken(token, 'exam_c')).toBeNull()
  })

  it('getUserRoleFromToken devuelve null con rol desconocido', () => {
    expect(getUserRoleFromToken(createUnsignedToken({ role: 'admin' }))).toBeNull()
  })
})
