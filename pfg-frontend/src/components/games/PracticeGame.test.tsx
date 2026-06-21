import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PracticeGame, PRACTICE_TRIAL_LIMIT } from './PracticeGame'

const mocks = vi.hoisted(() => ({
  addEvents: vi.fn(),
}))

vi.mock('../../context', () => ({
  useEvaluation: () => ({
    addEvents: mocks.addEvents,
  }),
}))

function advanceTimers(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe('PracticeGame', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.addEvents.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('muestra 10 ensayos de práctica por defecto', () => {
    render(<PracticeGame game="cpt" onComplete={vi.fn()} />)

    expect(PRACTICE_TRIAL_LIMIT).toBe(10)
    expect(
      screen.getByRole('heading', { name: /Práctica CPT — 10 ensayos/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('Ensayo 1 de 10')).toBeInTheDocument()
  })

  it('no envía eventos de práctica al contexto de evaluación', () => {
    render(<PracticeGame game="cpt" trialLimit={1} onComplete={vi.fn()} />)

    fireEvent.keyDown(window, { code: 'Space' })
    advanceTimers(350)

    expect(mocks.addEvents).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: /Comenzar evaluación real/i }),
    ).toBeInTheDocument()
  })

  it('muestra feedback correcto e incorrecto durante la práctica', () => {
    render(<PracticeGame game="cpt" trialMs={1_000} onComplete={vi.fn()} />)

    fireEvent.keyDown(window, { code: 'Space' })
    expect(screen.getByText('Correcto')).toBeInTheDocument()

    advanceTimers(350)

    fireEvent.keyDown(window, { code: 'Space' })
    expect(screen.getByText('Incorrecto')).toBeInTheDocument()
  })

  it('permite pasar de la práctica a la evaluación real', () => {
    const handleComplete = vi.fn()

    render(<PracticeGame game="stroop" trialLimit={1} onComplete={handleComplete} />)

    fireEvent.keyDown(window, { code: 'KeyR' })
    advanceTimers(350)

    fireEvent.click(
      screen.getByRole('button', { name: /Comenzar evaluación real/i }),
    )

    expect(handleComplete).toHaveBeenCalledTimes(1)
  })

  it('muestra feedback de ausencia de respuesta si se agota el ensayo', () => {
    render(<PracticeGame game="flanker" trialMs={500} onComplete={vi.fn()} />)

    advanceTimers(500)

    expect(screen.getByText('Sin respuesta / demasiado tarde')).toBeInTheDocument()
  })

  it('respeta los colores disponibles en la práctica Stroop', () => {
    render(
      <PracticeGame
        colorBlindMode={{ enabled: true, excludedColor: 'red' }}
        game="stroop"
        onComplete={vi.fn()}
      />,
    )

    expect(screen.queryByText('ROJO')).not.toBeInTheDocument()
    expect(screen.queryByText('R = rojo')).not.toBeInTheDocument()
    expect(screen.getByText('B = azul')).toBeInTheDocument()
    expect(screen.getByText('G = verde')).toBeInTheDocument()
    expect(screen.getByText('Y = amarillo')).toBeInTheDocument()
  })
})
