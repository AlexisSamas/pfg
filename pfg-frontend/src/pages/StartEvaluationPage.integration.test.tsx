import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, EvaluationProvider } from '../context'
import type { GameEvent, ScoringResult, SessionResponse } from '../types'
import { ResultPage } from './ResultPage'
import { StartEvaluationPage } from './StartEvaluationPage'

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  getResult: vi.fn(),
  getWait: vi.fn(),
  sendEvents: vi.fn(),
}))

const cptEvent: GameEvent = {
  game_type: 'cpt',
  event_type: 'hit',
  timestamp_us: 1_000,
  reaction_time_ms: 210,
  is_correct: true,
  stimulus_type: 'target',
}

const stroopEvent: GameEvent = {
  game_type: 'stroop',
  event_type: 'correct',
  timestamp_us: 2_000,
  reaction_time_ms: 320,
  is_correct: true,
  stimulus_type: 'congruent',
}

const flankerEvent: GameEvent = {
  game_type: 'flanker',
  event_type: 'hit',
  timestamp_us: 3_000,
  reaction_time_ms: 280,
  is_correct: true,
  stimulus_type: 'incongruent',
}

vi.mock('../api', () => ({
  API_TOKEN_STORAGE_KEY: 'pfg_auth_token',
  createSession: mocks.createSession,
  getResult: mocks.getResult,
  getWait: mocks.getWait,
  sendEvents: mocks.sendEvents,
}))

vi.mock('../components', async () => {
  const { useEvaluation } = await import('../context')

  return {
    FlowProgress: ({ currentStep }: { currentStep: string }) => (
      <nav>Flujo: {currentStep}</nav>
    ),
    GameInstructions: ({
      title,
      onStart,
    }: {
      title: string
      onStart: () => void
    }) => (
      <section>
        <h2>{title}</h2>
        <button type="button" onClick={onStart}>
          Comenzar práctica
        </button>
      </section>
    ),
    PracticeGame: ({
      game,
      onComplete,
    }: {
      game: string
      onComplete: () => void
    }) => (
      <section>
        <h2>Práctica {game}</h2>
        <button type="button" onClick={onComplete}>
          Terminar práctica {game}
        </button>
      </section>
    ),
    CPTGame: ({ onComplete }: { onComplete?: (events: GameEvent[]) => void }) => {
      const { addEvents } = useEvaluation()

      return (
        <button
          type="button"
          onClick={() => {
            addEvents([cptEvent])
            onComplete?.([cptEvent])
          }}
        >
          Completar CPT real
        </button>
      )
    },
    StroopGame: ({
      onComplete,
    }: {
      onComplete?: (events: GameEvent[]) => void
    }) => {
      const { addEvents } = useEvaluation()

      return (
        <button
          type="button"
          onClick={() => {
            addEvents([stroopEvent])
            onComplete?.([stroopEvent])
          }}
        >
          Completar Stroop real
        </button>
      )
    },
    FlankerGame: ({
      onComplete,
    }: {
      onComplete?: (events: GameEvent[]) => void
    }) => {
      const { addEvents } = useEvaluation()

      return (
        <button
          type="button"
          onClick={() => {
            addEvents([flankerEvent])
            onComplete?.([flankerEvent])
          }}
        >
          Completar Flanker real
        </button>
      )
    },
  }
})

const session: SessionResponse = {
  id: 42,
  user_id: 7,
  context_id: 'exam_test_01',
  attempt_number: 1,
  started_at: '2026-06-10T10:00:00',
  completed_at: null,
  status: 'created',
}

const result: ScoringResult = {
  id: 9,
  session_id: 42,
  trm_ms: 270,
  d_prime: 1.4,
  stroop_effect_ms: 120,
  flanker_effect_ms: 90,
  stroop_error_rate: 0.05,
  flanker_accuracy: 0.95,
  score: 88.5,
  decision: 'ACCESO',
  weakest_metric: 'stroop_effect_ms',
  recommendation_key: 'high_stroop_effect',
  computed_at: '2026-06-10T10:05:00',
  new_access_token: 'fresh.access.token',
}

function renderStudentFlow() {
  render(
    <MemoryRouter initialEntries={['/evaluation']}>
      <AuthProvider>
        <EvaluationProvider>
          <Routes>
            <Route path="/evaluation" element={<StartEvaluationPage />} />
            <Route path="/result" element={<ResultPage />} />
          </Routes>
        </EvaluationProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('integración del flujo alumno', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    mocks.createSession.mockReset()
    mocks.getResult.mockReset()
    mocks.getWait.mockReset()
    mocks.sendEvents.mockReset()
  })

  it('crea sesión, pasa por prácticas, envía eventos reales, consulta resultado y muestra decisión', async () => {
    mocks.createSession.mockResolvedValue(session)
    mocks.sendEvents.mockResolvedValue({ received: 3 })
    mocks.getResult.mockResolvedValue(result)

    renderStudentFlow()

    expect(
      screen.getByRole('heading', { name: /Iniciar evaluación cognitiva/i }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Realizar intento/i }))

    expect(await screen.findByText(/CPT: atención sostenida/i)).toBeInTheDocument()
    expect(mocks.createSession).toHaveBeenCalledWith({
      context_id: 'exam_test_10',
    })

    fireEvent.click(screen.getByRole('button', { name: /Comenzar práctica/i }))
    expect(screen.getByText('Práctica cpt')).toBeInTheDocument()
    expect(mocks.sendEvents).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Terminar práctica cpt/i }))
    fireEvent.click(screen.getByRole('button', { name: /Completar CPT real/i }))
    fireEvent.click(screen.getByRole('button', { name: /Continuar a Stroop/i }))
    fireEvent.click(screen.getByRole('radio', { name: 'Sí' }))
    fireEvent.change(
      screen.getByRole('combobox', { name: /Gama de color a excluir/i }),
      { target: { value: 'red' } },
    )
    fireEvent.click(screen.getByRole('button', { name: /Confirmar/i }))

    fireEvent.click(screen.getByRole('button', { name: /Comenzar práctica/i }))
    fireEvent.click(
      screen.getByRole('button', { name: /Terminar práctica stroop/i }),
    )
    fireEvent.click(screen.getByRole('button', { name: /Completar Stroop real/i }))
    fireEvent.click(screen.getByRole('button', { name: /Continuar a Flanker/i }))

    fireEvent.click(screen.getByRole('button', { name: /Comenzar práctica/i }))
    fireEvent.click(
      screen.getByRole('button', { name: /Terminar práctica flanker/i }),
    )
    fireEvent.click(screen.getByRole('button', { name: /Completar Flanker real/i }))

    await waitFor(() => {
      expect(mocks.sendEvents).toHaveBeenCalledWith(42, {
        events: [cptEvent, stroopEvent, flankerEvent],
      })
    })
    await waitFor(() => expect(mocks.getResult).toHaveBeenCalledWith(42))

    expect(await screen.findByText('88.50')).toBeInTheDocument()
    expect(screen.getAllByText('ACCESO')).toHaveLength(2)
    expect(screen.getByText(/Key: high_stroop_effect/i)).toBeInTheDocument()
    expect(localStorage.getItem('pfg_auth_token')).toBe('fresh.access.token')
  })
})
