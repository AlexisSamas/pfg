import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_TOKEN_STORAGE_KEY } from '../api'
import { AuthProvider } from '../context'
import type { LastEvaluationClaim } from '../types'
import { HomePage } from './HomePage'

function createToken(
  lastEvaluation: LastEvaluationClaim | null,
  role: 'student' | 'instructor' = 'student',
): string {
  const payload = btoa(JSON.stringify({ last_evaluation: lastEvaluation, role }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

  return `header.${payload}.signature`
}

function renderHome(
  lastEvaluation: LastEvaluationClaim | null,
  role: 'student' | 'instructor' = 'student',
) {
  if (lastEvaluation !== null) {
    localStorage.setItem(API_TOKEN_STORAGE_KEY, createToken(lastEvaluation, role))
  } else {
    localStorage.setItem(API_TOKEN_STORAGE_KEY, createToken(null, role))
  }

  render(
    <MemoryRouter>
      <AuthProvider>
        <HomePage />
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
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('muestra mensaje cuando no hay evaluación previa', () => {
    renderHome(null)

    expect(
      screen.getByText(/Todavía no tienes evaluaciones registradas/i),
    ).toBeInTheDocument()
  })

  it('muestra resumen de ACCESO', () => {
    renderHome(createLastEvaluation({ score: 75 }))

    expect(screen.getByText(/Tu última puntuación fue 75.0\/100/i)).toBeInTheDocument()
    expect(screen.getByText(/Has superado la evaluación/i)).toBeInTheDocument()
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
  })

  it('muestra solo la opción de evaluación para usuario student', () => {
    renderHome(null, 'student')

    expect(
      screen.getByRole('link', { name: /Iniciar evaluación/i }),
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
      screen.queryByText(/Todavía no tienes evaluaciones registradas/i),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/Tu última puntuación fue/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Has superado la evaluación/i)).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Dashboard docente/i }),
    ).toBeInTheDocument()
  })
})
