import { describe, expect, it } from 'vitest'
import { parseApiError } from './errorHandling'

function createAxiosLikeError(status: number, detail: unknown) {
  return {
    isAxiosError: true,
    response: {
      status,
      data: { detail },
    },
  }
}

describe('parseApiError', () => {
  it('detecta MAX_ATTEMPTS en 403', () => {
    const parsedError = parseApiError(
      createAxiosLikeError(403, {
        message: 'Maximum attempts exceeded',
        max_attempts: 3,
        context_id: 'exam_demo_01',
        requires_manual_grant: true,
      }),
    )

    expect(parsedError.message).toMatch(/número máximo de intentos/i)
    expect(parsedError.requiresManualGrant).toBe(true)
  })

  it('detecta bloqueo severo en 403', () => {
    const parsedError = parseApiError(
      createAxiosLikeError(403, {
        message: 'User is blocked for this context',
        context_id: 'exam_demo_01',
        requires_manual_grant: true,
        reason: 'BLOCK decision',
      }),
    )

    expect(parsedError.message).toMatch(/bloqueado nuevos intentos/i)
    expect(parsedError.requiresManualGrant).toBe(true)
  })

  it('detecta cooldown en 429 con wait_until y recomendación', () => {
    const parsedError = parseApiError(
      createAxiosLikeError(429, {
        message: 'Active cooldown',
        wait_until: '2026-06-10T12:00:00',
        recommendation_key: 'high_stroop_effect',
        reason: 'decision_espera',
      }),
    )

    expect(parsedError.message).toMatch(/debes esperar/i)
    expect(parsedError.waitUntil).toBe('2026-06-10T12:00:00')
    expect(parsedError.recommendationMessage).toMatch(/respuestas automáticas/i)
  })
})
