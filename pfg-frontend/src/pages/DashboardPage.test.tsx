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

async function renderDashboardWithRow() {
  mocks.getDashboardContext.mockResolvedValue([statusRow])

  render(<DashboardPage />)

  fireEvent.click(screen.getByRole('button', { name: /Consultar/i }))

  return screen.findByRole('button', { name: /Conceder acceso manual/i })
}

async function renderDashboardWithStatus(status: DashboardUserStatus) {
  mocks.getDashboardContext.mockResolvedValue([status])

  render(<DashboardPage />)

  fireEvent.click(screen.getByRole('button', { name: /Consultar/i }))

  await screen.findByText(status.username ?? String(status.user_id))
}

describe('DashboardPage', () => {
  beforeEach(() => {
    mocks.getDashboardContext.mockReset()
    mocks.grantManualAccess.mockReset()
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
    expect(screen.getByText(/sesiones y decisiones registradas\./i)).toBeInTheDocument()
    expect(screen.queryByText(/registradas por el backend/i)).not.toBeInTheDocument()
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
    expect(screen.queryByText('alumno1@example.com')).not.toBeInTheDocument()
    expect(screen.queryByText('exam_test_01')).not.toBeInTheDocument()
    expect(screen.queryByText('77')).not.toBeInTheDocument()
    expect(screen.queryByText('stroop_effect_ms')).not.toBeInTheDocument()
    expect(screen.queryByText('high_stroop_effect')).not.toBeInTheDocument()
    expect(screen.queryByText('2026-06-10T12:00:00')).not.toBeInTheDocument()
    expect(screen.getByText('72.34')).toBeInTheDocument()
    expect(screen.getByText('ESPERA')).toBeInTheDocument()
  })

  it('muestra solo las columnas útiles para el docente', async () => {
    mocks.getDashboardContext.mockResolvedValue([statusRow])

    render(<DashboardPage />)

    fireEvent.click(screen.getByRole('button', { name: /Consultar/i }))

    expect(
      await screen.findByRole('columnheader', { name: /^Usuario$/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: /^Intentos$/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /^Score$/i })).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: /^Decisión$/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: /^Grant manual$/i }),
    ).toBeInTheDocument()

    expect(
      screen.queryByRole('columnheader', { name: /Usuario \/ email/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('columnheader', { name: /^Contexto$/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('columnheader', { name: /Última sesión/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('columnheader', { name: /Métrica débil/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('columnheader', { name: /Recomendación/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('columnheader', { name: /Espera hasta/i }),
    ).not.toBeInTheDocument()
  })

  it('muestra acceso ya concedido para ACCESO normal y no ofrece grant manual', async () => {
    await renderDashboardWithStatus({
      ...statusRow,
      latest_decision: 'ACCESO',
      manual_grant: false,
    })

    expect(screen.getByText('Acceso ya concedido')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Conceder acceso manual/i }),
    ).not.toBeInTheDocument()
  })

  it('muestra acceso manual concedido cuando ya hay grant manual y no ofrece botón', async () => {
    await renderDashboardWithStatus({
      ...statusRow,
      latest_decision: 'ACCESO',
      manual_grant: true,
    })

    expect(screen.getByText('Acceso manual concedido')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Conceder acceso manual/i }),
    ).not.toBeInTheDocument()
  })

  it('mantiene el botón de grant manual para BLOQUEO sin grant', async () => {
    await renderDashboardWithStatus({
      ...statusRow,
      latest_decision: 'BLOQUEO',
      manual_grant: false,
    })

    expect(
      screen.getByRole('button', { name: /Conceder acceso manual/i }),
    ).toBeInTheDocument()
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

  it('abre modal propio al solicitar grant manual y no usa window.confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    const grantButton = await renderDashboardWithRow()

    fireEvent.click(grantButton)

    expect(
      screen.getByRole('dialog', { name: /Conceder acceso manual/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/¿Conceder acceso manual a alumno1\?/i),
    ).toBeInTheDocument()
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(mocks.grantManualAccess).not.toHaveBeenCalled()

    expect(screen.getByRole('dialog')).toHaveClass('modal-backdrop')
    expect(screen.getByRole('button', { name: /Cancelar/i })).toHaveClass(
      'modal-action-button',
    )
    expect(screen.getByRole('button', { name: /Conceder acceso$/i })).toHaveClass(
      'modal-action-button',
    )

    confirmSpy.mockRestore()
  })

  it('si se cancela el modal, no llama al endpoint', async () => {
    const grantButton = await renderDashboardWithRow()

    fireEvent.click(grantButton)
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mocks.grantManualAccess).not.toHaveBeenCalled()
  })

  it('al confirmar grant manual llama a la API con user_id, context_id y reason', async () => {
    mocks.getDashboardContext.mockResolvedValue([statusRow])
    mocks.grantManualAccess.mockResolvedValue({
      granted: true,
      manual_grant: true,
      user_id: 123,
      context_id: 'exam_test_01',
      decision: 'ACCESO',
    })

    render(<DashboardPage />)

    fireEvent.click(screen.getByRole('button', { name: /Consultar/i }))
    fireEvent.click(
      await screen.findByRole('button', { name: /Conceder acceso manual/i }),
    )
    fireEvent.click(screen.getByRole('button', { name: /Conceder acceso$/i }))

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
      manual_grant: true,
      user_id: 123,
      context_id: 'exam_test_01',
      decision: 'ACCESO',
    })

    render(<DashboardPage />)

    fireEvent.click(screen.getByRole('button', { name: /Consultar/i }))
    fireEvent.click(
      await screen.findByRole('button', { name: /Conceder acceso manual/i }),
    )
    fireEvent.click(screen.getByRole('button', { name: /Conceder acceso$/i }))

    expect(
      await screen.findByText(/Acceso manual concedido al usuario alumno1/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Correcto:/i)).not.toBeInTheDocument()
    expect(
      screen.queryByText(/Acceso manual concedido para el usuario 123/i),
    ).not.toBeInTheDocument()
    expect(mocks.getDashboardContext).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Acceso manual concedido')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('confirma grant manual para filas bloqueadas por máximo de intentos', async () => {
    const maxAttemptsRow = {
      ...statusRow,
      latest_attempt_number: 3,
      latest_decision: null,
      latest_score: null,
    }
    mocks.getDashboardContext
      .mockResolvedValueOnce([maxAttemptsRow])
      .mockResolvedValueOnce([
        {
          ...maxAttemptsRow,
          latest_decision: 'ACCESO',
          manual_grant: true,
        },
      ])
    mocks.grantManualAccess.mockResolvedValue({
      granted: true,
      manual_grant: true,
      user_id: 123,
      context_id: 'exam_test_01',
      decision: 'ACCESO',
    })

    render(<DashboardPage />)

    fireEvent.click(screen.getByRole('button', { name: /Consultar/i }))
    fireEvent.click(
      await screen.findByRole('button', { name: /Conceder acceso manual/i }),
    )
    fireEvent.click(screen.getByRole('button', { name: /Conceder acceso$/i }))

    expect(
      await screen.findByText(/Acceso manual concedido al usuario alumno1/i),
    ).toBeInTheDocument()
    expect(screen.getByText('Acceso manual concedido')).toBeInTheDocument()
    expect(
      screen.queryByText(/dashboard no confirm/i),
    ).not.toBeInTheDocument()
  })

  it('si el grant falla, muestra error y permite reintentar', async () => {
    const grantButton = await renderDashboardWithRow()
    mocks.grantManualAccess.mockRejectedValue(new Error('grant failed'))

    fireEvent.click(grantButton)
    fireEvent.click(screen.getByRole('button', { name: /Conceder acceso$/i }))

    expect(
      await screen.findByText(/No se pudo completar la operación/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Conceder acceso$/i }),
    ).not.toBeDisabled()
  })

  it('muestra éxito si el POST confirma grant aunque el refresco llegue stale', async () => {
    mocks.getDashboardContext
      .mockResolvedValueOnce([statusRow])
      .mockResolvedValueOnce([statusRow])
    mocks.grantManualAccess.mockResolvedValue({
      granted: true,
      manual_grant: true,
      user_id: 123,
      context_id: 'exam_test_01',
      decision: 'ACCESO',
    })

    render(<DashboardPage />)

    fireEvent.click(screen.getByRole('button', { name: /Consultar/i }))
    fireEvent.click(
      await screen.findByRole('button', { name: /Conceder acceso manual/i }),
    )
    fireEvent.click(screen.getByRole('button', { name: /Conceder acceso$/i }))

    expect(
      await screen.findByText(/Acceso manual concedido al usuario alumno1/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/dashboard no confirm/i)).not.toBeInTheDocument()
    expect(screen.getByText('Acceso manual concedido')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
