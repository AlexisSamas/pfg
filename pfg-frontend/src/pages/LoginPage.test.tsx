import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { AuthProvider } from '../context'
import { LoginPage } from './LoginPage'

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renderiza el formulario de login', () => {
    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    )

    expect(
      screen.getByRole('heading', {
        name: /sistema de monitorización cognitiva/i,
      }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/usuario/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /iniciar sesión/i }),
    ).toBeInTheDocument()
  })
})
