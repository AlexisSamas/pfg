import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScoringResult, WaitResponse } from '../types'
import { ResultPage } from './ResultPage'

const mocks = vi.hoisted(() => ({
  evaluationValue: undefined as unknown,
  getWait: vi.fn(),
}))

vi.mock('../api', () => ({
  getWait: mocks.getWait,
}))

vi.mock('../context', () => ({
  useEvaluation: () => mocks.evaluationValue,
}))

function createResult(
  decision: ScoringResult['decision'],
): ScoringResult {
  return {
    id: 1,
    session_id: 10,
    trm_ms: 315,
    d_prime: 1.2,
    stroop_effect_ms: 180,
    flanker_effect_ms: 90,
    stroop_error_rate: 0.15,
    flanker_accuracy: 0.82,
    score: 78.456,
    decision,
    weakest_metric: 'stroop_effect_ms',
    recommendation_key: 'high_stroop_effect',
    computed_at: '2026-06-09T10:00:00',
  }
}

function renderResultPage(result: ScoringResult) {
  mocks.evaluationValue = {
    result,
    sessionId: 10,
    waitInfo: null,
    setWaitInfo: vi.fn(),
    clearEvaluation: vi.fn(),
  }

  render(
    <MemoryRouter>
      <ResultPage />
    </MemoryRouter>,
  )
}

describe('ResultPage', () => {
  beforeEach(() => {
    mocks.getWait.mockReset()
  })

  it('muestra correctamente la decisión ACCESO', () => {
    renderResultPage(createResult('ACCESO'))

    expect(screen.getAllByText('ACCESO')).toHaveLength(2)
    expect(screen.getByText('78.46')).toBeInTheDocument()
    expect(
      screen.getByText(/puedes continuar con el proceso/i),
    ).toBeInTheDocument()
    expect(mocks.getWait).not.toHaveBeenCalled()
  })

  it('muestra correctamente la decisión ESPERA', async () => {
    const waitInfo: WaitResponse = {
      wait_until: '2026-06-09T12:00:00',
      recommendation_key: 'high_stroop_effect',
      reason: 'decision_espera',
    }
    mocks.getWait.mockResolvedValue(waitInfo)
    renderResultPage(createResult('ESPERA'))

    expect(screen.getAllByText('ESPERA')).toHaveLength(2)
    expect(
      screen.getByText(/debes esperar antes de reintentar/i),
    ).toBeInTheDocument()
    await waitFor(() => expect(mocks.getWait).toHaveBeenCalledWith(10))
  })

  it('muestra correctamente la decisión BLOQUEO', () => {
    renderResultPage(createResult('BLOQUEO'))

    expect(screen.getAllByText('BLOQUEO')).toHaveLength(2)
    expect(
      screen.getByText(/contacta con el docente/i),
    ).toBeInTheDocument()
    expect(mocks.getWait).not.toHaveBeenCalled()
  })
})
