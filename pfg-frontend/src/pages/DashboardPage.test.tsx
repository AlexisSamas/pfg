import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardUserStatus } from '../types'
import { DashboardPage } from './DashboardPage'

const mocks = vi.hoisted(() => ({
  getDashboardContext: vi.fn(),
  grantManualAccess: vi.fn(),
}))

vi.mock('../api', () => ({
  getDashboardContext: mocks.getDashboardContext,
  grantManualAccess: mocks.grantManualAccess,
}))

const statusRow: DashboardUserStatus = {
  user_id: 123,
  username: 'alumno1',
  email: 'alumno1@example.com',
  context_id: 'exam_test_01',
  latest_session_id: 77,
  latest_attempt_number: 2,
  latest_status: 'completed',
  latest_score: 72.345,
  latest_decision: 'ESPERA',
  weakest_metric: 'stroop_effect_ms',
  recommendation_key: 'high_stroop_effect',
  wait_until: '2026-06-10T12:00:00',
  manual_grant: false,
  computed_at: '2026-06-10T11:00:00',
}

function forbiddenError() {
  return {
    isAxiosError: true,
    response: {
      status: 403,
      data: {
        detail: 'Forbidden',
      },
    },
  }
}

describe('DashboardPage', () => {
  beforeEach(() => {
    mocks.getDashboardContext.mockReset()
    mocks.grantManualAccess.mockReset()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('renderiza la pantalla de dashboard docente', () => {
    render(<DashboardPage />)

    expect(
      screen.getByRole('heading', { name: /Dashboard docente/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText(/Identificador del examen\/contexto/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Consultar/i })).toBeInTheDocument()
  })

  it('permite introducir context_id y consultar', async () => {
    const user = userEvent.setup()
    mocks.getDashboardContext.mockResolvedValue([])

    render(<DashboardPage />)

    const input = screen.getByLabelText(/Identificador del examen\/contexto/i)
    await user.clear(input)
    await user.type(input, 'exam_test_01')
    await user.click(screen.getByRole('button', { name: /Consultar/i }))

    await waitFor(() => {
      expect(mocks.getDashboardContext).toHaveBeenCalledWith('exam_test_01')
    })
  })

  it('muestra filas devueltas por getDashboardContext', async () => {
    mocks.getDashboardContext.mockResolvedValue([statusRow])

    render(<DashboardPage />)

    fireEvent.click(screen.getByRole('button', { name: /Consultar/i }))

    expect(await screen.findByText('alumno1')).toBeInTheDocument()
    expect(screen.getByText('alumno1@example.com')).toBeInTheDocument()
    expect(screen.getByText('exam_test_01')).toBeInTheDocument()
    expect(screen.getByText('72.34')).toBeInTheDocument()
    expect(screen.getByText('ESPERA')).toBeInTheDocument()
  })

  it('muestra mensaje de lista vacía', async () => {
    mocks.getDashboardContext.mockResolvedValue([])

    render(<DashboardPage />)

    fireEvent.click(screen.getByRole('button', { name: /Consultar/i }))

    expect(
      await screen.findByText(/No hay sesiones para este contexto/i),
    ).toBeInTheDocument()
  })

  it('muestra error 403 como falta de permisos docentes', async () => {
    mocks.getDashboardContext.mockRejectedValue(forbiddenError())

    render(<DashboardPage />)

    fireEvent.click(screen.getByRole('button', { name: /Consultar/i }))

    expect(
      await screen.findByText(/No tienes permisos de docente/i),
    ).toBeInTheDocument()
  })

  it('grant manual llama a la API con user_id, context_id y reason', async () => {
    mocks.getDashboardContext.mockResolvedValue([statusRow])
    mocks.grantManualAccess.mockResolvedValue({
      granted: true,
      user_id: 123,
      context_id: 'exam_test_01',
      decision: 'ACCESO',
    })

    render(<DashboardPage />)

    fireEvent.click(screen.getByRole('button', { name: /Consultar/i }))
    fireEvent.click(
      await screen.findByRole('button', { name: /Conceder acceso manual/i }),
    )

    await waitFor(() => {
      expect(mocks.grantManualAccess).toHaveBeenCalledWith({
        user_id: 123,
        context_id: 'exam_test_01',
        reason: 'Acceso concedido manualmente desde el dashboard docente',
      })
    })
  })

  it('tras grant manual muestra éxito y refresca el dashboard', async () => {
    mocks.getDashboardContext
      .mockResolvedValueOnce([statusRow])
      .mockResolvedValueOnce([
        {
          ...statusRow,
          latest_decision: 'ACCESO',
          manual_grant: true,
        },
      ])
    mocks.grantManualAccess.mockResolvedValue({
      granted: true,
      user_id: 123,
      context_id: 'exam_test_01',
      decision: 'ACCESO',
    })

    render(<DashboardPage />)

    fireEvent.click(screen.getByRole('button', { name: /Consultar/i }))
    fireEvent.click(
      await screen.findByRole('button', { name: /Conceder acceso manual/i }),
    )

    expect(
      await screen.findByText(/Acceso manual concedido para el usuario 123/i),
    ).toBeInTheDocument()
    expect(mocks.getDashboardContext).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Acceso manual concedido')).toBeInTheDocument()
  })
})
