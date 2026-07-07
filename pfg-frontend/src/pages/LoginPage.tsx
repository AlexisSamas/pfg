import { useState, type FormEvent } from 'react'
import axios from 'axios'
import { login as loginRequest } from '../api'
import { FlowProgress } from '../components'
import { useAuth, useEvaluation } from '../context'
import type { LoginRequest } from '../types'
import './LoginPage.css'

const MIN_USERNAME_LENGTH = 3
const MIN_PASSWORD_LENGTH = 6

export function LoginPage() {
  const { login } = useAuth()
  const { clearEvaluation } = useEvaluation()
  const [credentials, setCredentials] = useState<LoginRequest>({
    username: '',
    password: '',
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasLoggedIn, setHasLoggedIn] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setHasLoggedIn(false)

    const username = credentials.username.trim()

    if (username.length < MIN_USERNAME_LENGTH) {
      setError('El usuario debe tener al menos 3 caracteres.')
      return
    }

    if (credentials.password.length < MIN_PASSWORD_LENGTH) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }

    setIsLoading(true)

    try {
      const authToken = await loginRequest({
        username,
        password: credentials.password,
      })
      clearEvaluation()
      login(authToken.access_token)
      setHasLoggedIn(true)
    } catch (requestError) {
      if (
        axios.isAxiosError(requestError) &&
        requestError.response?.status === 422
      ) {
        setError(
          'Los datos introducidos no tienen el formato esperado. Revisa el usuario y la contraseña.',
        )
      } else if (
        axios.isAxiosError(requestError) &&
        requestError.response?.status === 401
      ) {
        setError('Credenciales incorrectas. Revisa el usuario y la contraseña.')
      } else {
        setError(
          'No se pudo conectar con el servidor. Comprueba que el servicio esté disponible e inténtalo de nuevo.',
        )
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section className="login-page" aria-labelledby="login-title">
      <FlowProgress currentStep="login" />
      <div className="project-intro">
        <h1
          aria-label="Sistema de monitorización cognitiva"
          id="login-title"
        >
          Sistema de
          <br />
          monitorización cognitiva
        </h1>
        <p className="description">
          Aplicación web para evaluar el rendimiento cognitivo mediante
          <br />
          juegos serios y mostrar retroalimentación al usuario.
        </p>
      </div>

      <form
        aria-busy={isLoading}
        className="login-form"
        onSubmit={handleSubmit}
      >
        <div className="form-field">
          <label htmlFor="username">Usuario</label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            value={credentials.username}
            disabled={isLoading}
            onChange={(event) =>
              setCredentials((currentCredentials) => ({
                ...currentCredentials,
                username: event.target.value,
              }))
            }
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={credentials.password}
            disabled={isLoading}
            onChange={(event) =>
              setCredentials((currentCredentials) => ({
                ...currentCredentials,
                password: event.target.value,
              }))
            }
            required
          />
        </div>

        {error && (
          <p className="form-message error-message" role="alert">
            {error}
          </p>
        )}

        {hasLoggedIn && !error && !isLoading && (
          <p className="form-message success-message" role="status">
            Inicio de sesión correcto.
          </p>
        )}

        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Validando credenciales...' : 'Iniciar sesión'}
        </button>
      </form>
    </section>
  )
}
