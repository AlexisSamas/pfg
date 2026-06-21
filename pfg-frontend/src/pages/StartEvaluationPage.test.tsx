import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameEvent, ScoringResult } from '../types'
import { StartEvaluationPage } from './StartEvaluationPage'

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  evaluationValue: undefined as unknown,
  getResult: vi.fn(),
  logout: vi.fn(),
  navigate: vi.fn(),
  sendEvents: vi.fn(),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()

  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  }
})

vi.mock('../api', () => ({
  createSession: mocks.createSession,
  getResult: mocks.getResult,
  sendEvents: mocks.sendEvents,
}))

vi.mock('../context', () => ({
  useAuth: () => ({
    login: vi.fn(),
    logout: mocks.logout,
  }),
  useEvaluation: () => mocks.evaluationValue,
}))

vi.mock('../components', () => ({
  CPTGame: () => <section>CPT real</section>,
  FlankerGame: () => <section>Flanker real</section>,
  FlowProgress: ({ currentStep }: { currentStep: string }) => (
    <nav>Flujo: {currentStep}</nav>
  ),
  GameInstructions: ({ onStart }: { onStart: () => void }) => (
    <button type="button" onClick={onStart}>
      Empezar práctica
    </button>
  ),
  PracticeGame: ({
    game,
    onComplete,
  }: {
    game: string
    onComplete: () => void
  }) => (
    <section>
      <h1>Práctica {game}</h1>
      <button type="button" onClick={onComplete}>
        Comenzar evaluación real
      </button>
    </section>
  ),
  StroopGame: () => <section>Stroop real</section>,
}))

const realEvent: GameEvent = {
  game_type: 'cpt',
  event_type: 'hit',
  timestamp_us: 1,
  reaction_time_ms: 250,
  is_correct: true,
  stimulus_type: 'target',
}

const result: ScoringResult = {
  id: 1,
  session_id: 42,
  trm_ms: 250,
  d_prime: 1.1,
  stroop_effect_ms: 100,
  flanker_effect_ms: 80,
  stroop_error_rate: 0.1,
  flanker_accuracy: 0.9,
  score: 80,
  decision: 'ACCESO',
  weakest_metric: 'stroop_effect_ms',
  recommendation_key: 'high_stroop_effect',
  computed_at: '2026-06-10T10:00:00',
}

function setEvaluationValue(overrides: Record<string, unknown>) {
  mocks.evaluationValue = {
    accumulatedEvents: [],
    contextId: 'exam_demo_01',
    currentGame: null,
    sessionId: null,
    setCurrentGame: vi.fn(),
    setResult: vi.fn(),
    startEvaluation: vi.fn(),
    ...overrides,
  }
}

function renderStartEvaluationPage() {
  render(
    <MemoryRouter>
      <StartEvaluationPage />
    </MemoryRouter>,
  )
}

describe('StartEvaluationPage', () => {
  beforeEach(() => {
    mocks.createSession.mockReset()
    mocks.getResult.mockReset()
    mocks.logout.mockReset()
    mocks.navigate.mockReset()
    mocks.sendEvents.mockReset()
  })

  it('pasa de práctica a evaluación real sin enviar eventos al backend', () => {
    setEvaluationValue({
      currentGame: 'cpt',
      sessionId: 42,
    })

    renderStartEvaluationPage()

    fireEvent.click(screen.getByRole('button', { name: /Empezar práctica/i }))
    expect(screen.getByRole('heading', { name: /Práctica cpt/i })).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: /Comenzar evaluación real/i }),
    )

    expect(screen.getByText('CPT real')).toBeInTheDocument()
    expect(mocks.sendEvents).not.toHaveBeenCalled()
  })

  it('envía al backend los eventos reales acumulados al completar la evaluación', async () => {
    mocks.sendEvents.mockResolvedValue({ received: 1 })
    mocks.getResult.mockResolvedValue(result)
    setEvaluationValue({
      accumulatedEvents: [realEvent],
      currentGame: 'completed',
      sessionId: 42,
    })

    renderStartEvaluationPage()

    await waitFor(() => {
      expect(mocks.sendEvents).toHaveBeenCalledWith(42, {
        events: [realEvent],
      })
    })
  })

  it('muestra la configuración de modo daltónico en la fase previa a Stroop', () => {
    setEvaluationValue({
      currentGame: 'stroop',
      sessionId: 42,
    })

    renderStartEvaluationPage()

    expect(
      screen.getByRole('group', { name: /Accesibilidad visual/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'No' })).toBeChecked()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Sí' }))

    expect(
      screen.getByRole('combobox', { name: /Gama de color a excluir/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Gama azul' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Gama roja' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Gama verde' })).toBeInTheDocument()
  })
})
