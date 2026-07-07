import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_TOKEN_STORAGE_KEY } from '../api'
import { AuthProvider } from '../context'
import { EvaluationContext, type EvaluationContextValue } from '../context/evaluation-context'
import type { LastEvaluationClaim } from '../types'
import { HomePage } from './HomePage'

const mocks = vi.hoisted(() => ({
  getStudentStatus: vi.fn(),
}))

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()

  return {
    ...actual,
    getStudentStatus: mocks.getStudentStatus,
  }
})

type TestStudentStatus = {
  attempt_count: number
  max_attempts: number
  last_evaluation?: LastEvaluationClaim | null
}

function createToken(
  lastEvaluation: LastEvaluationClaim | null,
  role: 'student' | 'instructor' = 'student',
  attemptsByContext: Array<{
    context_id: string
    attempt_count: number
    max_attempts: number
  }> = [],
): string {
  const payload = btoa(
    JSON.stringify({
      attempts_by_context: attemptsByContext,
      last_evaluation: lastEvaluation,
      role,
    }),
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

  return `header.${payload}.signature`
}

function renderHome(
  lastEvaluation: LastEvaluationClaim | null,
  role: 'student' | 'instructor' = 'student',
  contextId = 'exam_demo_01',
  attemptsByContext: Array<{
    context_id: string
    attempt_count: number
    max_attempts: number
  }> = [],
  refreshedStatus?: TestStudentStatus,
  refreshStudentStatus = false,
) {
  const storedToken =
    lastEvaluation !== null
      ? createToken(lastEvaluation, role, attemptsByContext)
      : createToken(null, role, attemptsByContext)

  if (lastEvaluation !== null) {
    localStorage.setItem(API_TOKEN_STORAGE_KEY, storedToken)
  } else {
    localStorage.setItem(API_TOKEN_STORAGE_KEY, storedToken)
  }
  const currentAttemptContext = attemptsByContext.find(
    (attempts) => attempts.context_id === contextId,
  )
  mocks.getStudentStatus.mockResolvedValue({
    context_id: contextId,
    attempt_count:
      refreshedStatus?.attempt_count ?? currentAttemptContext?.attempt_count ?? 0,
    max_attempts:
      refreshedStatus?.max_attempts ?? currentAttemptContext?.max_attempts ?? 3,
    last_evaluation:
      refreshedStatus?.last_evaluation ??
      (lastEvaluation?.context_id === contextId ? lastEvaluation : null),
  })

  const evaluationValue: EvaluationContextValue = {
    accumulatedEvents: [],
    addEvents: vi.fn(),
    attemptNumber: null,
    clearEvaluation: vi.fn(),
    contextId,
    currentGame: null,
    result: null,
    sessionId: null,
    setCurrentGame: vi.fn(),
    setResult: vi.fn(),
    setWaitInfo: vi.fn(),
    startEvaluation: vi.fn(),
    waitInfo: null,
  }

  render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: '/',
          state: refreshStudentStatus
            ? { refreshStudentStatus: true }
            : undefined,
        },
      ]}
    >
      <AuthProvider>
        <EvaluationContext.Provider value={evaluationValue}>
          <HomePage />
        </EvaluationContext.Provider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function createLastEvaluation(
  overrides: Partial<LastEvaluationClaim> = {},
): LastEvaluationClaim {
  return {
    session_id: 1,
    context_id: 'exam_demo_01',
    score: 75,
    decision: 'ACCESO',
    weakest_metric: 'd_prime',
    recommendation_key: 'low_dprime',
    computed_at: '2026-06-10T10:00:00',
    wait_until: null,
    requires_manual_grant: false,
    manual_grant: false,
    ...overrides,
  }
}

describe('HomePage last_evaluation', () => {
  beforeEach(() => {
    localStorage.clear()
    mocks.getStudentStatus.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('muestra mensaje cuando no hay evaluación previa', () => {
    renderHome(null)

    expect(
      screen.getByText(
        /Todavía no tienes evaluaciones registradas para este contexto\./i,
      ),
    ).toBeInTheDocument()
  })

  it('oculta iniciar evaluación cuando se alcanza el máximo de intentos', () => {
    renderHome(null, 'student', 'exam_demo_01', [
      {
        context_id: 'exam_demo_01',
        attempt_count: 3,
        max_attempts: 3,
      },
    ])

    expect(
      screen.getByText(/Has alcanzado el número máximo de intentos/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/Contacta con un docente/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /Iniciar evaluación/i }),
    ).not.toBeInTheDocument()
  })

  it('refresca intentos al volver a Home y bloquea el cuarto intento', async () => {
    renderHome(
      null,
      'student',
      'exam_demo_01',
      [
        {
          context_id: 'exam_demo_01',
          attempt_count: 2,
          max_attempts: 3,
        },
      ],
      {
        attempt_count: 3,
        max_attempts: 3,
      },
      true,
    )

    expect(
      screen.queryByRole('link', { name: /Iniciar evaluación/i }),
    ).not.toBeInTheDocument()
    expect(
      await screen.findByText(/Has alcanzado el número máximo de intentos/i),
    ).toBeInTheDocument()
    expect(mocks.getStudentStatus).toHaveBeenCalledWith('exam_demo_01')
    expect(
      screen.queryByRole('link', { name: /Iniciar evaluación/i }),
    ).not.toBeInTheDocument()
  })

  it('muestra iniciar evaluación tras refresh si el alumno no tiene bloqueos ni máximo de intentos', async () => {
    renderHome(
      null,
      'student',
      'exam_demo_01',
      [],
      {
        attempt_count: 0,
        max_attempts: 3,
      },
      true,
    )

    expect(
      screen.getByText(
        /Todavía no tienes evaluaciones registradas para este contexto\./i,
      ),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('link', { name: /Iniciar evaluación/i }),
    ).toBeInTheDocument()
  })

  it.each([0, 1, 2])(
    'muestra iniciar evaluación con %s intentos incompletos',
    async (attemptCount) => {
      renderHome(null, 'student', 'exam_demo_01', [
        {
          context_id: 'exam_demo_01',
          attempt_count: attemptCount,
          max_attempts: 3,
        },
      ])

      expect(
        screen.getByText(
          /Todavía no tienes evaluaciones registradas para este contexto\./i,
        ),
      ).toBeInTheDocument()
      expect(
        await screen.findByRole('link', { name: /Iniciar evaluación/i }),
      ).toBeInTheDocument()
    },
  )

  it('prioriza grant manual sobre máximo de intentos', () => {
    renderHome(
      createLastEvaluation({
        decision: 'ACCESO',
        manual_grant: true,
      }),
      'student',
      'exam_demo_01',
      [
        {
          context_id: 'exam_demo_01',
          attempt_count: 3,
          max_attempts: 3,
        },
      ],
    )

    expect(
      screen.getByText(/Un docente te ha concedido acceso manual/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/Has alcanzado el número máximo de intentos/i),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /Iniciar evaluación/i }),
    ).not.toBeInTheDocument()
  })

  it('prioriza grant manual fresco sobre máximo de intentos', async () => {
    renderHome(
      null,
      'student',
      'exam_demo_01',
      [
        {
          context_id: 'exam_demo_01',
          attempt_count: 3,
          max_attempts: 3,
        },
      ],
      {
        attempt_count: 3,
        max_attempts: 3,
        last_evaluation: createLastEvaluation({
          decision: 'ACCESO',
          manual_grant: true,
        }),
      },
      true,
    )

    expect(
      await screen.findByText(/Un docente te ha concedido acceso manual/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/Estado actual: ACCESO/i)).toBeInTheDocument()
    expect(
      screen.queryByText(/Has alcanzado el número máximo de intentos/i),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /Iniciar evaluación/i }),
    ).not.toBeInTheDocument()
  })

  it('mantiene iniciar evaluación si los intentos son de otro contexto', async () => {
    renderHome(null, 'student', 'exam_demo_02', [
      {
        context_id: 'exam_demo_01',
        attempt_count: 3,
        max_attempts: 3,
      },
    ])

    expect(
      screen.queryByText(/Has alcanzado el número máximo de intentos/i),
    ).not.toBeInTheDocument()
    expect(
      await screen.findByRole('link', { name: /Iniciar evaluación/i }),
    ).toBeInTheDocument()
  })

  it('muestra resumen de ACCESO', () => {
    renderHome(createLastEvaluation({ score: 75 }))

    expect(screen.getByText(/Tu última puntuación fue 75.0\/100/i)).toBeInTheDocument()
    expect(screen.getByText(/Has superado la evaluación/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /Iniciar evaluación/i }),
    ).not.toBeInTheDocument()
  })

  it('muestra resumen de ESPERA con countdown', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-18T10:00:00Z'))

    renderHome(
      createLastEvaluation({
        score: 57.5,
        decision: 'ESPERA',
        wait_until: '2026-06-18T10:01:05Z',
      }),
    )

    expect(screen.getByText(/Tu última puntuación fue 57.5\/100/i)).toBeInTheDocument()
    expect(screen.getByText(/Estás en estado de espera/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Puedes reintentarlo cuando finalice el tiempo de espera: 1:05/i),
    ).toBeInTheDocument()
  })

  it('muestra espera finalizada si wait_until ya estaba vencido', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-18T10:00:00Z'))

    renderHome(
      createLastEvaluation({
        score: 57.5,
        decision: 'ESPERA',
        wait_until: '2026-06-18T09:59:00Z',
      }),
    )

    expect(
      screen.getByText(/Ya ha finalizado tu tiempo de espera. Puedes reintentar la evaluación/i),
    ).toBeInTheDocument()
  })

  it('muestra mensaje claro si ESPERA no incluye wait_until', () => {
    renderHome(
      createLastEvaluation({
        score: 57.5,
        decision: 'ESPERA',
        wait_until: null,
      }),
    )

    expect(
      screen.getByText(/No se ha podido recuperar el tiempo de espera/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/^Puedes reintentarlo cuando finalice el tiempo de espera\.$/i),
    ).not.toBeInTheDocument()
  })

  it('muestra mensaje claro si ESPERA incluye wait_until inválido', () => {
    renderHome(
      createLastEvaluation({
        score: 57.5,
        decision: 'ESPERA',
        wait_until: 'fecha-no-valida',
      }),
    )

    expect(
      screen.getByText(/No se ha podido recuperar el tiempo de espera/i),
    ).toBeInTheDocument()
  })

  it('actualiza automáticamente la espera activa cuando llega a cero', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-18T10:00:00Z'))

    renderHome(
      createLastEvaluation({
        score: 57.5,
        decision: 'ESPERA',
        wait_until: '2026-06-18T10:00:02Z',
      }),
    )

    expect(
      screen.getByText(/Puedes reintentarlo cuando finalice el tiempo de espera: 0:02/i),
    ).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2_000)
    })

    expect(
      screen.getByText(/Ya ha finalizado tu tiempo de espera. Puedes reintentar la evaluación/i),
    ).toBeInTheDocument()
  })

  it('muestra resumen de BLOQUEO', () => {
    renderHome(createLastEvaluation({ score: 20, decision: 'BLOQUEO' }))

    expect(screen.getByText(/Tu última puntuación fue 20.0\/100/i)).toBeInTheDocument()
    expect(screen.getByText(/Contacta con un docente/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /Iniciar evaluación/i }),
    ).not.toBeInTheDocument()
  })

  it('muestra acceso manual cuando manual_grant es true', () => {
    renderHome(
      createLastEvaluation({
        decision: 'ACCESO',
        manual_grant: true,
      }),
    )

    expect(
      screen.getByText(/Un docente te ha concedido acceso manual/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/Estado actual: ACCESO/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /Iniciar evaluación/i }),
    ).not.toBeInTheDocument()
  })

  it('prioriza acceso manual aunque exista una decisión de bloqueo antigua', () => {
    renderHome(
      createLastEvaluation({
        score: 20,
        decision: 'BLOQUEO',
        requires_manual_grant: false,
        manual_grant: true,
      }),
    )

    expect(
      screen.getByText(/Un docente te ha concedido acceso manual/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/Estado actual: ACCESO/i)).toBeInTheDocument()
    expect(screen.queryByText(/Tu última puntuación fue/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Contacta con un docente/i)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /Iniciar evaluación/i }),
    ).not.toBeInTheDocument()
  })

  it.each([
    [
      'ACCESO normal',
      createLastEvaluation({
        context_id: 'exam_A',
        decision: 'ACCESO',
        manual_grant: false,
      }),
      /Has superado la evaluación/i,
    ],
    [
      'grant manual',
      createLastEvaluation({
        context_id: 'exam_A',
        decision: 'ACCESO',
        manual_grant: true,
      }),
      /Un docente te ha concedido acceso manual/i,
    ],
    [
      'BLOQUEO',
      createLastEvaluation({
        context_id: 'exam_A',
        decision: 'BLOQUEO',
        score: 20,
      }),
      /Contacta con un docente/i,
    ],
    [
      'ESPERA',
      createLastEvaluation({
        context_id: 'exam_A',
        decision: 'ESPERA',
        wait_until: '2026-06-18T10:01:05Z',
      }),
      /Estás en estado de espera/i,
    ],
  ])('ignora %s de otro contexto', async (_caseName, previousEvaluation, hiddenText) => {
    renderHome(previousEvaluation, 'student', 'exam_B')

    expect(
      screen.getByText(
        /Todavía no tienes evaluaciones registradas para este contexto\./i,
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(hiddenText)).not.toBeInTheDocument()
    expect(
      await screen.findByRole('link', { name: /Iniciar evaluación/i }),
    ).toBeInTheDocument()
  })

  it('muestra solo la opción de evaluación para usuario student', async () => {
    renderHome(null, 'student')

    expect(
      await screen.findByRole('link', { name: /Iniciar evaluación/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /Dashboard docente/i }),
    ).not.toBeInTheDocument()
  })

  it('muestra solo la opción de dashboard para usuario instructor', () => {
    renderHome(null, 'instructor')

    expect(
      screen.getByRole('link', { name: /Dashboard docente/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /Iniciar evaluación/i }),
    ).not.toBeInTheDocument()
  })

  it('no muestra bloque de última evaluación para usuario instructor', () => {
    renderHome(createLastEvaluation({ score: 75 }), 'instructor')

    expect(
      screen.queryByText(/Todavía no tienes evaluaciones registradas para este contexto/i),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/Tu última puntuación fue/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Has superado la evaluación/i)).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Dashboard docente/i }),
    ).toBeInTheDocument()
  })
})
