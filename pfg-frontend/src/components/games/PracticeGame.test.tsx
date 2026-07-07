import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  generateCptPracticeTrials,
  generateFlankerPracticeTrials,
  generateStroopPracticeTrials,
  PRACTICE_TRIAL_LIMIT,
} from './practiceTrials'
import { PracticeGame } from './PracticeGame'

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

function mockRandomValues(values: number[], fallback = 0.9) {
  let index = 0

  vi.spyOn(Math, 'random').mockImplementation(() => {
    const value = values[index] ?? fallback
    index += 1

    return value
  })
}

describe('PracticeGame', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.addEvents.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('muestra 10 ensayos de práctica por defecto', () => {
    render(<PracticeGame game="cpt" onComplete={vi.fn()} />)

    expect(PRACTICE_TRIAL_LIMIT).toBe(10)
    expect(
      screen.getByRole('heading', { name: /Práctica CPT — 10 ensayos/i }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Ensayo 1 de 10')).not.toBeInTheDocument()
    expect(screen.queryByText(/Feedback inmediato/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Barra espaciadora/i)).not.toBeInTheDocument()
    expect(
      screen.queryByText(/No pulses si aparece otra letra/i),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/Esta fase no cuenta para la puntuación/i),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/Recibirás feedback para familiarizarte con la tarea/i),
    ).not.toBeInTheDocument()
  })

  it('no envía eventos de práctica al contexto de evaluación', () => {
    mockRandomValues([0])
    render(
      <PracticeGame
        game="cpt"
        trialLimit={1}
        trialMs={1_000}
        onComplete={vi.fn()}
      />,
    )

    fireEvent.keyDown(window, { code: 'Space' })
    advanceTimers(1_000)

    expect(mocks.addEvents).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: /Comenzar evaluación real/i }),
    ).toBeInTheDocument()
  })

  it('en práctica CPT pulsar espacio no avanza inmediatamente al siguiente estímulo', () => {
    mockRandomValues([0.2, 0.9, 0])
    const { container } = render(
      <PracticeGame game="cpt" trialMs={1_000} onComplete={vi.fn()} />,
    )
    const getStimulus = () =>
      container.querySelector('.practice-stimulus span')?.textContent

    const firstStimulus = getStimulus()
    expect(firstStimulus).toBeTruthy()

    fireEvent.keyDown(window, { code: 'Space' })

    expect(getStimulus()).toBe(firstStimulus)
    expect(screen.getByText(/Correcto|Error/)).toBeInTheDocument()

    advanceTimers(350)

    expect(getStimulus()).toBe(firstStimulus)

    advanceTimers(650)

    expect(getStimulus()).not.toBe(firstStimulus)
  })

  it('en práctica Stroop pulsar una respuesta no avanza inmediatamente al siguiente estímulo', () => {
    mockRandomValues([0.9, 0, 0.9, 0.9])
    const { container } = render(
      <PracticeGame game="stroop" trialMs={1_000} onComplete={vi.fn()} />,
    )
    const getStimulus = () => {
      const stimulus = container.querySelector(
        '.practice-stimulus span',
      ) as HTMLElement | null

      return `${stimulus?.textContent}-${stimulus?.style.color}`
    }

    const firstStimulus = getStimulus()

    fireEvent.keyDown(window, { code: 'KeyR' })

    expect(getStimulus()).toBe(firstStimulus)
    expect(screen.getByText(/Correcto|Error/)).toBeInTheDocument()

    advanceTimers(350)

    expect(getStimulus()).toBe(firstStimulus)

    advanceTimers(650)

    expect(getStimulus()).not.toBe(firstStimulus)
  })

  it('muestra feedback CPT mínimo y lo mantiene visible hasta el siguiente resultado', () => {
    mockRandomValues([0.2, 0.9, 0])
    render(<PracticeGame game="cpt" trialMs={1_000} onComplete={vi.fn()} />)

    const feedbackSlot = screen.getByTestId('cpt-practice-feedback')
    expect(feedbackSlot).toBeEmptyDOMElement()

    advanceTimers(1_000)
    expect(screen.getByText(/Correcto|Error/)).toBeInTheDocument()
    expect(screen.queryByText(/Correcto:/i)).not.toBeInTheDocument()

    advanceTimers(350)

    expect(screen.getByText('Correcto')).toBeInTheDocument()

    advanceTimers(1_000)
    expect(screen.getByText('Error')).toBeInTheDocument()
    expect(screen.queryByText('Incorrecto')).not.toBeInTheDocument()
  })

  it('permite pasar de la práctica a la evaluación real', () => {
    const handleComplete = vi.fn()

    render(<PracticeGame game="stroop" trialLimit={1} onComplete={handleComplete} />)

    fireEvent.keyDown(window, { code: 'KeyR' })
    advanceTimers(1_500)

    fireEvent.click(
      screen.getByRole('button', { name: /Comenzar evaluación real/i }),
    )

    expect(handleComplete).toHaveBeenCalledTimes(1)
  })

  it('muestra feedback mínimo de error si se agota el ensayo', () => {
    render(<PracticeGame game="flanker" trialMs={500} onComplete={vi.fn()} />)

    expect(screen.getByTestId('flanker-practice-feedback')).toBeEmptyDOMElement()

    advanceTimers(500)

    expect(screen.getByText('Error')).toBeInTheDocument()
    expect(
      screen.queryByText('Sin respuesta / demasiado tarde'),
    ).not.toBeInTheDocument()
  })

  it('aplica feedback mínimo y persistente en práctica Stroop y Flanker', () => {
    const { rerender } = render(
      <PracticeGame game="stroop" trialMs={1_000} onComplete={vi.fn()} />,
    )

    fireEvent.keyDown(window, { code: 'KeyR' })
    expect(screen.getByText(/Correcto|Error/)).toBeInTheDocument()
    expect(screen.queryByText(/Correcto:/i)).not.toBeInTheDocument()

    advanceTimers(350)

    expect(screen.getByText(/Correcto|Error/)).toBeInTheDocument()

    rerender(
      <PracticeGame game="flanker" trialMs={1_000} onComplete={vi.fn()} />,
    )

    fireEvent.keyDown(window, { code: 'ArrowRight' })
    expect(screen.getByText(/Correcto|Error/)).toBeInTheDocument()
    expect(screen.queryByText('Incorrecto')).not.toBeInTheDocument()
  })

  it('no muestra badges ni bloque informativo en práctica Stroop y Flanker', () => {
    const { rerender } = render(<PracticeGame game="stroop" onComplete={vi.fn()} />)

    expect(screen.queryByText('Ensayo 1 de 10')).not.toBeInTheDocument()
    expect(screen.queryByText(/Feedback inmediato/i)).not.toBeInTheDocument()
    expect(
      screen.queryByText(/Esta fase no cuenta para la puntuación/i),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/Recibirás feedback para familiarizarte con la tarea/i),
    ).not.toBeInTheDocument()

    rerender(<PracticeGame game="flanker" onComplete={vi.fn()} />)

    expect(screen.queryByText('Ensayo 1 de 10')).not.toBeInTheDocument()
    expect(screen.queryByText(/Feedback inmediato/i)).not.toBeInTheDocument()
    expect(
      screen.queryByText(/Esta fase no cuenta para la puntuación/i),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/Recibirás feedback para familiarizarte con la tarea/i),
    ).not.toBeInTheDocument()
  })

  it('no muestra instrucciones inferiores de teclas en práctica Stroop', () => {
    render(<PracticeGame game="stroop" onComplete={vi.fn()} />)

    expect(screen.queryByText('R = rojo')).not.toBeInTheDocument()
    expect(screen.queryByText('G = verde')).not.toBeInTheDocument()
    expect(screen.queryByText('B = azul')).not.toBeInTheDocument()
    expect(screen.queryByText('Y = amarillo')).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText(/Controles práctica Stroop/i),
    ).not.toBeInTheDocument()
  })

  it('no muestra instrucciones inferiores ni destaca la flecha central en práctica Flanker', () => {
    const { container } = render(
      <PracticeGame game="flanker" onComplete={vi.fn()} />,
    )

    expect(screen.queryByText('ArrowLeft = izquierda')).not.toBeInTheDocument()
    expect(screen.queryByText('ArrowRight = derecha')).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText(/Controles práctica Flanker/i),
    ).not.toBeInTheDocument()
    expect(container.querySelector('.practice-flanker .central-arrow')).toBeNull()
  })

  it('respeta los colores disponibles en la práctica Stroop', () => {
    mockRandomValues([0.9, 0])
    render(
      <PracticeGame
        colorBlindMode={{ enabled: true, excludedColor: 'red' }}
        game="stroop"
        onComplete={vi.fn()}
      />,
    )

    expect(screen.queryByText('ROJO')).not.toBeInTheDocument()
    expect(screen.queryByText('R = rojo')).not.toBeInTheDocument()
    expect(screen.queryByText('B = azul')).not.toBeInTheDocument()
    expect(screen.queryByText('G = verde')).not.toBeInTheDocument()
    expect(screen.queryByText('Y = amarillo')).not.toBeInTheDocument()

    fireEvent.keyDown(window, { code: 'KeyB' })

    expect(screen.getByText(/Correcto|Error/)).toBeInTheDocument()
  })

  it('genera práctica CPT aleatoria de 10 ensayos con reglas de distancia entre X', () => {
    mockRandomValues([0.8, 0.9, 0, 0.9, 0.1, 0.9, 0.2, 0.9, 0.3, 0.8])
    const firstSequence = generateCptPracticeTrials(PRACTICE_TRIAL_LIMIT).map(
      (trial) => trial.stimulus,
    )

    vi.restoreAllMocks()
    mockRandomValues([0, 0.4, 0.9, 0, 0.9, 0.1, 0.7, 0.9, 0.2, 0.9])
    const secondSequence = generateCptPracticeTrials(PRACTICE_TRIAL_LIMIT).map(
      (trial) => trial.stimulus,
    )

    expect(firstSequence).toHaveLength(10)
    expect(secondSequence).toHaveLength(10)
    expect(firstSequence).not.toEqual(secondSequence)

    for (const sequence of [firstSequence, secondSequence]) {
      for (let index = 1; index < sequence.length; index += 1) {
        expect(sequence[index]).not.toBe(sequence[index - 1])
      }

      const targetIndexes = sequence
        .map((letter, index) => (letter === 'X' ? index : -1))
        .filter((index) => index >= 0)
      const gaps = targetIndexes
        .slice(1)
        .map((index, gapIndex) => index - targetIndexes[gapIndex] - 1)

      expect(targetIndexes.length).toBeGreaterThanOrEqual(2)
      expect(gaps.every((gap) => gap >= 1 && gap <= 4)).toBe(true)
    }
  })

  it('evita repetir patrones exactos en la práctica sin alternancia artificial', () => {
    mockRandomValues([
      0.9, 0.0, 0.9, 0.5, 0.1, 0.0, 0.1, 0.5, 0.9, 0.9, 0.1, 0.0,
    ])
    const stroopPatterns = generateStroopPracticeTrials(PRACTICE_TRIAL_LIMIT, {
      enabled: true,
      excludedColor: 'red',
    }).map((trial) => `${trial.stimulus}-${trial.expectedCode}`)

    vi.restoreAllMocks()
    mockRandomValues([
      0.1, 0.5, 0.9, 0.9, 0.1, 0.0, 0.9, 0.5, 0.1, 0.5, 0.9, 0.0,
    ])
    const secondStroopPatterns = generateStroopPracticeTrials(
      PRACTICE_TRIAL_LIMIT,
      {
        enabled: true,
        excludedColor: 'red',
      },
    ).map((trial) => `${trial.stimulus}-${trial.expectedCode}`)
    const flankerTrials = generateFlankerPracticeTrials(PRACTICE_TRIAL_LIMIT)
    const flankerPatterns = flankerTrials.map((trial) =>
      trial.flankerParts?.join(''),
    )

    expect(stroopPatterns).toHaveLength(10)
    expect(secondStroopPatterns).toHaveLength(10)
    expect(flankerTrials.every((trial) => trial.flankerParts?.length === 7)).toBe(
      true,
    )
    expect(stroopPatterns).not.toEqual(secondStroopPatterns)

    for (const values of [stroopPatterns, secondStroopPatterns, flankerPatterns]) {
      for (let index = 1; index < values.length; index += 1) {
        expect(values[index]).not.toBe(values[index - 1])
      }
    }

    expect(
      flankerTrials.some((trial) => {
        const flankers = trial.flankerParts?.filter((_, index) => index !== 3)

        return new Set(flankers).size > 1
      }),
    ).toBe(true)
    expect(stroopPatterns.join(' ')).not.toContain('ROJO')
    expect(secondStroopPatterns.join(' ')).not.toContain('ROJO')
  })
})
