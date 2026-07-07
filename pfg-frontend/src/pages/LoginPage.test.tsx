import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, EvaluationProvider } from '../context'
import { LoginPage } from './LoginPage'

const mocks = vi.hoisted(() => ({
  loginRequest: vi.fn(),
}))

vi.mock('../api', () => ({
  API_TOKEN_STORAGE_KEY: 'pfg_auth_token',
  login: mocks.loginRequest,
}))

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    mocks.loginRequest.mockReset()
  })

  function renderLoginPage() {
    render(
      <AuthProvider>
        <EvaluationProvider>
          <LoginPage />
        </EvaluationProvider>
      </AuthProvider>,
    )
  }

  it('renderiza el formulario de login', () => {
    renderLoginPage()

    expect(
      screen.getByRole('heading', {
        name: /sistema de monitorizaci.n cognitiva/i,
      }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/usuario/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/contrase.a/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /iniciar sesi.n/i }),
    ).toBeInTheDocument()
  })

  it('limpia estado persistido de evaluación tras login correcto', async () => {
    const user = userEvent.setup()
    mocks.loginRequest.mockResolvedValue({ access_token: 'fresh.token' })
    sessionStorage.setItem('pfg_evaluation_state', '{"sessionId":42}')
    sessionStorage.setItem('pfg_evaluation_flow', '{"currentGame":"flanker"}')

    renderLoginPage()

    await user.type(screen.getByLabelText(/usuario/i), 'nuevo_usuario')
    await user.type(screen.getByLabelText(/contrase.a/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /iniciar sesi.n/i }))

    await waitFor(() => {
      expect(localStorage.getItem('pfg_auth_token')).toBe('fresh.token')
    })
    expect(sessionStorage.getItem('pfg_evaluation_state')).toBeNull()
    expect(sessionStorage.getItem('pfg_evaluation_flow')).toBeNull()
  })
})
