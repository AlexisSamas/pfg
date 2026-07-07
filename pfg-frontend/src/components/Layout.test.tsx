import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { API_TOKEN_STORAGE_KEY } from '../api'
import { AuthProvider, EvaluationProvider } from '../context'
import { Layout } from './Layout'

function createToken(role: 'student' | 'instructor'): string {
  const payload = btoa(JSON.stringify({ role }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

  return `header.${payload}.signature`
}

function renderLayout(role: 'student' | 'instructor') {
  localStorage.setItem(API_TOKEN_STORAGE_KEY, createToken(role))

  render(
    <MemoryRouter>
      <AuthProvider>
        <EvaluationProvider>
          <Layout />
        </EvaluationProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('Layout navigation by role', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('muestra la marca y la barra de 6 pasos en el header autenticado', () => {
    renderLayout('student')

    expect(
      screen.getByRole('link', { name: /Monitorización cognitiva/i }),
    ).toBeInTheDocument()

    const flowProgress = screen.getByRole('list', {
      name: /Progreso del flujo/i,
    })

    expect(within(flowProgress).getByText('Login')).toBeInTheDocument()
    expect(within(flowProgress).getByText('Sesión')).toBeInTheDocument()
    expect(within(flowProgress).getByText('CPT')).toBeInTheDocument()
    expect(within(flowProgress).getByText('Stroop')).toBeInTheDocument()
    expect(within(flowProgress).getByText('Flanker')).toBeInTheDocument()
    expect(within(flowProgress).getByText('Resultado')).toBeInTheDocument()
  })

  it('muestra solo Evaluación y cerrar sesión en el header para usuario student', () => {
    renderLayout('student')

    const nav = screen.getByRole('navigation', {
      name: /Navegación principal/i,
    })

    expect(
      within(nav).getByRole('link', { name: /^Evaluación$/i }),
    ).toBeInTheDocument()
    expect(
      within(nav).getByRole('button', { name: /Cerrar sesión/i }),
    ).toBeInTheDocument()
    expect(
      within(nav).queryByRole('link', { name: /Dashboard docente/i }),
    ).not.toBeInTheDocument()
  })

  it('muestra solo Dashboard docente y cerrar sesión en el header para usuario instructor', () => {
    renderLayout('instructor')

    const nav = screen.getByRole('navigation', {
      name: /Navegación principal/i,
    })

    expect(
      within(nav).getByRole('link', { name: /Dashboard docente/i }),
    ).toBeInTheDocument()
    expect(
      within(nav).getByRole('button', { name: /Cerrar sesión/i }),
    ).toBeInTheDocument()
    expect(
      within(nav).queryByRole('link', { name: /^Evaluación$/i }),
    ).not.toBeInTheDocument()
  })

  it('limpia estado persistido de evaluación al cerrar sesión', () => {
    sessionStorage.setItem('pfg_evaluation_state', '{"sessionId":42}')
    sessionStorage.setItem('pfg_evaluation_flow', '{"currentGame":"cpt"}')

    renderLayout('student')

    fireEvent.click(screen.getByRole('button', { name: /Cerrar sesi.n/i }))

    expect(localStorage.getItem(API_TOKEN_STORAGE_KEY)).toBeNull()
    expect(sessionStorage.getItem('pfg_evaluation_state')).toBeNull()
    expect(sessionStorage.getItem('pfg_evaluation_flow')).toBeNull()
  })
})
