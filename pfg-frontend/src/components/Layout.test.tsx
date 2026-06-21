import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { API_TOKEN_STORAGE_KEY } from '../api'
import { AuthProvider } from '../context'
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
        <Layout />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('Layout navigation by role', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('muestra solo Evaluación en el header para usuario student', () => {
    renderLayout('student')

    const nav = screen.getByRole('navigation', {
      name: /Navegación principal/i,
    })

    expect(
      within(nav).getByRole('link', { name: /^Evaluación$/i }),
    ).toBeInTheDocument()
    expect(
      within(nav).queryByRole('link', { name: /Dashboard docente/i }),
    ).not.toBeInTheDocument()
  })

  it('muestra solo Dashboard docente en el header para usuario instructor', () => {
    renderLayout('instructor')

    const nav = screen.getByRole('navigation', {
      name: /Navegación principal/i,
    })

    expect(
      within(nav).getByRole('link', { name: /Dashboard docente/i }),
    ).toBeInTheDocument()
    expect(
      within(nav).queryByRole('link', { name: /^Evaluación$/i }),
    ).not.toBeInTheDocument()
  })
})
