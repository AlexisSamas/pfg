import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScoringResult, WaitResponse } from '../types'
import { ResultPage } from './ResultPage'

const mocks = vi.hoisted(() => ({
  evaluationValue: undefined as unknown,
  getResult: vi.fn(),
  getWait: vi.fn(),
  updateToken: vi.fn(),
}))

vi.mock('../api', () => ({
  getResult: mocks.getResult,
  getWait: mocks.getWait,
}))

vi.mock('../context', () => ({
  useEvaluation: () => mocks.evaluationValue,
  useAuth: () => ({
    login: mocks.updateToken,
  }),
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
    setResult: vi.fn(),
    setWaitInfo: vi.fn(),
    clearEvaluation: vi.fn(),
  }

  render(
    <MemoryRouter>
      <ResultPage />
    </MemoryRouter>,
  )
}

function expectDecisionWithScore(decision: ScoringResult['decision']) {
  expect(
    screen.getByText((_content, element) => {
      if (!element?.classList.contains('result-decision')) {
        return false
      }

      const normalizedText = (element.textContent ?? '')
        .replace(/\s+/g, ' ')
        .replace('·', '·')
        .trim()

      return normalizedText === `${decision} · Score: 78.46`
    }),
  ).toBeInTheDocument()
}

describe('ResultPage', () => {
  beforeEach(() => {
    mocks.getResult.mockReset()
    mocks.getWait.mockReset()
    mocks.updateToken.mockReset()
  })

  it('muestra correctamente la decisión ACCESO', () => {
    renderResultPage(createResult('ACCESO'))

    expectDecisionWithScore('ACCESO')
    expect(screen.queryByText(/^Score$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Decisión$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Métrica más débil/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Recomendación$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Key:/i)).not.toBeInTheDocument()
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

    expectDecisionWithScore('ESPERA')
    expect(
      screen.getByText(/debes esperar antes de reintentar/i),
    ).toBeInTheDocument()
    await waitFor(() => expect(mocks.getWait).toHaveBeenCalledWith(10))
  })

  it('muestra correctamente la decisión BLOQUEO', () => {
    renderResultPage(createResult('BLOQUEO'))

    expectDecisionWithScore('BLOQUEO')
    expect(
      screen.getByText(/contacta con el docente/i),
    ).toBeInTheDocument()
    expect(mocks.getWait).not.toHaveBeenCalled()
  })

  it('obtiene el resultado si llega sin resultado en contexto', async () => {
    const setResult = vi.fn()
    const result = createResult('BLOQUEO')
    mocks.getResult.mockResolvedValue(result)
    mocks.evaluationValue = {
      result: null,
      sessionId: 10,
      waitInfo: null,
      setResult,
      setWaitInfo: vi.fn(),
      clearEvaluation: vi.fn(),
    }

    render(
      <MemoryRouter>
        <ResultPage />
      </MemoryRouter>,
    )

    expect(
      screen.getByText(/Obteniendo resultado final/i),
    ).toBeInTheDocument()
    await waitFor(() => expect(mocks.getResult).toHaveBeenCalledWith(10))
    expect(setResult).toHaveBeenCalledWith(result)
  })

  it('reintenta si el resultado devuelve 425 temporalmente', async () => {
    const setResult = vi.fn()
    const result = createResult('ACCESO')
    mocks.getResult
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 425, data: { detail: 'Not ready' } },
      })
      .mockResolvedValueOnce(result)
    mocks.evaluationValue = {
      result: null,
      sessionId: 10,
      waitInfo: null,
      setResult,
      setWaitInfo: vi.fn(),
      clearEvaluation: vi.fn(),
    }

    render(
      <MemoryRouter>
        <ResultPage />
      </MemoryRouter>,
    )

    await waitFor(() => expect(mocks.getResult).toHaveBeenCalledTimes(2), {
      timeout: 2_000,
    })
    expect(setResult).toHaveBeenCalledWith(result)
  })

  it('al pulsar atrás desde resultados vuelve a inicio', async () => {
    mocks.evaluationValue = {
      result: createResult('ACCESO'),
      sessionId: 10,
      waitInfo: null,
      setResult: vi.fn(),
      setWaitInfo: vi.fn(),
      clearEvaluation: vi.fn(),
    }

    render(
      <MemoryRouter initialEntries={['/result']}>
        <Routes>
          <Route path="/" element={<p>Inicio alumno</p>} />
          <Route path="/result" element={<ResultPage />} />
        </Routes>
      </MemoryRouter>,
    )

    window.dispatchEvent(new Event('popstate'))

    expect(await screen.findByText(/Inicio alumno/i)).toBeInTheDocument()
    expect(screen.queryByText(/Hay una prueba en curso/i)).not.toBeInTheDocument()
  })
})
