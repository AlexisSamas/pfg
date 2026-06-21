import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  PracticeGame: ({ onComplete }: { onComplete: () => void }) => (
    <button type="button" onClick={onComplete}>
      Comenzar evaluación real
    </button>
  ),
  StroopGame: () => <section>Stroop real</section>,
}))

function renderStartEvaluationPage() {
  mocks.evaluationValue = {
    accumulatedEvents: [],
    contextId: 'exam_demo_01',
    currentGame: null,
    sessionId: null,
    setCurrentGame: vi.fn(),
    setResult: vi.fn(),
    startEvaluation: vi.fn(),
  }

  render(
    <MemoryRouter>
      <StartEvaluationPage />
    </MemoryRouter>,
  )
}

describe('StartEvaluationPage errores backend', () => {
  beforeEach(() => {
    mocks.createSession.mockReset()
  })

  it('muestra cooldown 429 al crear sesión', async () => {
    mocks.createSession.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 429,
        data: {
          detail: {
            message: 'Active cooldown',
            wait_until: '2026-06-10T12:00:00',
            recommendation_key: 'high_stroop_effect',
          },
        },
      },
    })

    renderStartEvaluationPage()

    fireEvent.click(screen.getByRole('button', { name: /Iniciar evaluación/i }))

    expect(await screen.findByText(/Debes esperar/i)).toBeInTheDocument()
    expect(screen.getByText(/2026-06-10T12:00:00/i)).toBeInTheDocument()
  })
})
