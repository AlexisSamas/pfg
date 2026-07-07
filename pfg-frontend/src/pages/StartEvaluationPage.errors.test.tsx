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
  token: null as string | null,
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
    token: mocks.token,
  }),
  useEvaluation: () => mocks.evaluationValue,
}))

function createToken(payload: object): string {
  const encodedPayload = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

  return `header.${encodedPayload}.signature`
}

vi.mock('../components', () => ({
  CPTGame: () => <section>CPT real</section>,
  FlankerGame: () => <section>Flanker real</section>,
  FlowProgress: ({ currentStep }: { currentStep: string }) => (
    <nav>Flujo: {currentStep}</nav>
  ),
  GameInstructions: ({ onStart }: { onStart: () => void }) => (
    <button type="button" onClick={onStart}>
      Comenzar práctica
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
    clearEvaluation: vi.fn(),
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
    mocks.token = null
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

    fireEvent.click(screen.getByRole('button', { name: /Realizar intento/i }))

    expect(await screen.findByText(/Debes esperar/i)).toBeInTheDocument()
    expect(screen.getByText(/2026-06-10T12:00:00/i)).toBeInTheDocument()
  })

  it('muestra mensaje específico cuando el backend bloquea el contexto', async () => {
    mocks.createSession.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 403,
        data: {
          detail: {
            message: 'User is blocked for this context',
            context_id: 'exam_demo_01',
            requires_manual_grant: true,
            reason: 'BLOCK decision',
          },
        },
      },
    })

    renderStartEvaluationPage()

    fireEvent.click(screen.getByRole('button', { name: /Realizar intento/i }))

    expect(
      await screen.findByText(/ha bloqueado nuevos intentos/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/comprueba la conexión/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/nueva evaluación/i)).not.toBeInTheDocument()
  })

  it('no crea sesión si el token ya indica BLOQUEO sin grant manual en el contexto actual', async () => {
    mocks.token = createToken({
      role: 'student',
      last_evaluation: {
        session_id: 99,
        context_id: 'exam_demo_01',
        score: 25,
        decision: 'BLOQUEO',
        weakest_metric: 'd_prime',
        recommendation_key: 'low_dprime',
        computed_at: '2026-06-10T10:00:00',
        wait_until: null,
        requires_manual_grant: true,
        manual_grant: false,
      },
    })

    renderStartEvaluationPage()

    fireEvent.click(screen.getByRole('button', { name: /Realizar intento/i }))

    expect(
      await screen.findByText(/ha bloqueado nuevos intentos/i),
    ).toBeInTheDocument()
    expect(mocks.createSession).not.toHaveBeenCalled()
    expect(
      (mocks.evaluationValue as { startEvaluation: ReturnType<typeof vi.fn> })
        .startEvaluation,
    ).not.toHaveBeenCalled()
  })
})
