import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventType, GameEvent, StimulusType } from '../../types'
import { CPTGame } from './CPTGame'
import { FlankerGame } from './FlankerGame'
import {
  CPT_MAX_NON_TARGETS_BETWEEN_TARGETS,
  createFlankerStimulus,
  createInitialCptGenerationState,
  createStroopStimulus,
  getNextCptLetter,
  type CptGenerationState,
} from './stimulusGenerators'
import { StroopGame } from './StroopGame'
import { getAvailableStroopColors } from './stroopColors'

const mocks = vi.hoisted(() => ({
  addEvents: vi.fn(),
}))

vi.mock('../../context', () => ({
  useEvaluation: () => ({
    addEvents: mocks.addEvents,
  }),
}))

function mockRandomValues(values: number[]) {
  let index = 0

  vi.spyOn(Math, 'random').mockImplementation(() => {
    const value = values[index] ?? values.at(-1) ?? 0
    index += 1

    return value
  })
}

function advanceTimers(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

function collectedEvents(): GameEvent[] {
  return mocks.addEvents.mock.calls.flatMap(([events]) => events as GameEvent[])
}

function expectEventTypes(expectedTypes: EventType[]) {
  const eventTypes = collectedEvents().map((event) => event.event_type)

  for (const expectedType of expectedTypes) {
    expect(eventTypes).toContain(expectedType)
  }
}

function expectStimulusTypes(expectedTypes: Exclude<StimulusType, null>[]) {
  const stimulusTypes = collectedEvents().map((event) => event.stimulus_type)

  for (const expectedType of expectedTypes) {
    expect(stimulusTypes).toContain(expectedType)
  }
}

function expectPositiveReactionTime() {
  expect(
    collectedEvents().some(
      (event) =>
        event.reaction_time_ms !== null && event.reaction_time_ms > 0,
    ),
  ).toBe(true)
}

describe('eventos de juegos', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.addEvents.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('CPTGame muestra una UI limpia sin instrucción ni contadores internos', () => {
    render(<CPTGame durationMs={200} intervalMs={100} />)

    expect(screen.getByText(/Tiempo restante:/i)).toBeInTheDocument()
    expect(
      screen.queryByText(/Pulsa la barra espaciadora/i),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/Eventos generados/i)).not.toBeInTheDocument()
    expect(screen.queryByText('hit')).not.toBeInTheDocument()
    expect(screen.queryByText('miss')).not.toBeInTheDocument()
    expect(screen.queryByText('false_alarm')).not.toBeInTheDocument()
    expect(screen.queryByText('correct_rejection')).not.toBeInTheDocument()
  })

  it('StroopGame muestra tiempo restante sin eventos ni contadores visibles', () => {
    render(<StroopGame durationMs={200} trialMs={100} />)

    expect(screen.getByText('Stroop')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /Tarea de color e inhibición/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Tiempo restante:/i)).toBeInTheDocument()
    expect(
      screen.queryByText(/Responde al color de la tinta/i),
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Controles Stroop/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Eventos generados/i)).not.toBeInTheDocument()
    expect(screen.queryByText('correct')).not.toBeInTheDocument()
    expect(screen.queryByText('error')).not.toBeInTheDocument()
    expect(screen.queryByText('timeout')).not.toBeInTheDocument()
    expect(screen.queryByText('congruent')).not.toBeInTheDocument()
    expect(screen.queryByText('incongruent')).not.toBeInTheDocument()
  })

  it('FlankerGame muestra tiempo restante sin eventos ni contadores visibles', () => {
    const { container } = render(<FlankerGame durationMs={200} trialMs={100} />)

    expect(screen.getByText(/Tiempo restante:/i)).toBeInTheDocument()
    expect(container.querySelector('.flanker-arrows .central-arrow')).toBeNull()
    expect(screen.queryByText(/Eventos generados/i)).not.toBeInTheDocument()
    expect(screen.queryByText('hit')).not.toBeInTheDocument()
    expect(screen.queryByText('error')).not.toBeInTheDocument()
    expect(screen.queryByText('timeout')).not.toBeInTheDocument()
    expect(screen.queryByText('congruent')).not.toBeInTheDocument()
    expect(screen.queryByText('incongruent')).not.toBeInTheDocument()
  })

  it('CPTGame genera hit, miss, false_alarm y correct_rejection', () => {
    mockRandomValues([
      0.1, // target: hit
      0.9, 0, // non-target: false_alarm
      0.1, // target: miss
      0.9, 0, // non-target: correct_rejection
    ])

    render(
      <CPTGame
        durationMs={450}
        intervalMs={100}
        targetProbability={0.5}
      />,
    )

    advanceTimers(10)
    fireEvent.keyDown(window, { code: 'Space' })
    advanceTimers(90)
    advanceTimers(100)
    advanceTimers(100)
    advanceTimers(10)
    fireEvent.keyDown(window, { code: 'Space' })
    advanceTimers(90)

    expectEventTypes([
      'hit',
      'miss',
      'false_alarm',
      'correct_rejection',
    ])
    expectStimulusTypes(['target', 'non_target'])
    expectPositiveReactionTime()
  })

  it('StroopGame genera correct, error, timeout, congruent e incongruent', () => {
    mockRandomValues([
      0.9, 0, // red congruent: correct
      0.1, 0, // red word, blue ink: error
      0.1, 0, // another incongruent stimulus: timeout
    ])

    render(
      <StroopGame
        durationMs={400}
        trialMs={100}
        incongruentProbability={0.5}
      />,
    )

    advanceTimers(10)
    fireEvent.keyDown(window, { code: 'KeyR' })
    advanceTimers(90)
    advanceTimers(10)
    fireEvent.keyDown(window, { code: 'KeyR' })
    advanceTimers(90)
    advanceTimers(100)

    expectEventTypes(['correct', 'error', 'timeout'])
    expectStimulusTypes(['congruent', 'incongruent'])
    expectPositiveReactionTime()
  })

  it('StroopGame respeta la exclusión de color y mantiene el contrato de eventos', () => {
    mockRandomValues([
      0.9, 0, // first congruent pair is blue/blue when red is excluded
    ])

    render(
      <StroopGame
        colorBlindMode={{ enabled: true, excludedColor: 'red' }}
        durationMs={200}
        trialMs={100}
        incongruentProbability={0.5}
      />,
    )

    expect(screen.queryByText('ROJO')).not.toBeInTheDocument()
    expect(screen.queryByText('R = rojo')).not.toBeInTheDocument()
    expect(screen.queryByText('B = azul')).not.toBeInTheDocument()

    advanceTimers(10)
    fireEvent.keyDown(window, { code: 'KeyB' })

    const [event] = collectedEvents()

    expect(event).toMatchObject({
      game_type: 'stroop',
      event_type: 'correct',
      is_correct: true,
      stimulus_type: 'congruent',
    })
    expect(event.reaction_time_ms).toBeGreaterThan(0)
  })

  it('CPTGame sincroniza eventos con la duración y el intervalo configurados', () => {
    mockRandomValues([0.9, 0, 0.9, 0.2, 0.9, 0.4])

    render(<CPTGame durationMs={300} intervalMs={100} targetProbability={0} />)

    advanceTimers(300)

    expect(collectedEvents()).toHaveLength(3)
    expect(screen.getByText(/Tiempo restante: 0 s/i)).toBeInTheDocument()
  })

  it('StroopGame sincroniza eventos con la duración y el intervalo configurados', () => {
    mockRandomValues([0.9, 0, 0.9, 0.5, 0.9, 0.75])

    render(
      <StroopGame
        durationMs={300}
        trialMs={100}
        incongruentProbability={0.5}
      />,
    )

    advanceTimers(300)

    expect(collectedEvents()).toHaveLength(3)
    expect(screen.getByText(/Tiempo restante: 0 s/i)).toBeInTheDocument()
  })

  it('FlankerGame sincroniza eventos con la duración y el intervalo configurados', () => {
    mockRandomValues([
      0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0.9, 0, 0, 0,
      0.9, 0.9, 0.9, 0, 0.9, 0.9, 0.9,
    ])

    render(
      <FlankerGame
        durationMs={300}
        trialMs={100}
        incongruentProbability={0.5}
      />,
    )

    advanceTimers(300)

    expect(collectedEvents()).toHaveLength(3)
    expect(screen.getByText(/Tiempo restante: 0 s/i)).toBeInTheDocument()
  })

  it('FlankerGame genera hit, error, timeout, congruent e incongruent', () => {
    mockRandomValues([
      0, 0, 0, 0, 0, 0, 0, // all left: hit + congruent
      0, 0, 0, 0.9, 0, 0, 0, // right central with left distractors: error
      0.9, 0.9, 0.9, 0, 0.9, 0.9, 0.9, // left central with right distractors: timeout
    ])

    render(
      <FlankerGame
        durationMs={400}
        trialMs={100}
        incongruentProbability={0.5}
      />,
    )

    advanceTimers(10)
    fireEvent.keyDown(window, { code: 'ArrowLeft' })
    advanceTimers(90)
    advanceTimers(10)
    fireEvent.keyDown(window, { code: 'ArrowLeft' })
    advanceTimers(90)
    advanceTimers(100)

    expectEventTypes(['hit', 'error', 'timeout'])
    expectStimulusTypes(['congruent', 'incongruent'])
    expectPositiveReactionTime()
  })

  it('los generadores reales evitan repetir patrones exactos sin alternancia artificial', () => {
    mockRandomValues([0, 0, 0, 0])

    let cptState: CptGenerationState = {
      previousLetter: 'X',
      nonTargetsSinceLastTarget: 0,
      nextTargetGap: 4,
    }
    const cptLetters: string[] = []
    for (let index = 0; index < 8; index += 1) {
      const nextLetter = getNextCptLetter(0, cptState)
      const letter = nextLetter.letter

      expect(letter).not.toBe(cptState.previousLetter)
      cptLetters.push(letter)
      cptState = nextLetter.state
    }
    expect(cptLetters).toContain('X')

    vi.restoreAllMocks()
    mockRandomValues([
      0.5, 0, // blue word, green ink
      0.5, 0, // blue word, yellow ink
      0.5, 0.45, // green word, yellow ink
    ])

    const availableColors = getAvailableStroopColors({
      enabled: true,
      excludedColor: 'red',
    })
    let previousStroopPattern: Parameters<typeof createStroopStimulus>[2] = null
    const stroopPatterns = []
    for (let index = 0; index < 3; index += 1) {
      const stimulus = createStroopStimulus(
        1,
        availableColors,
        previousStroopPattern,
      )

      const currentPattern = { word: stimulus.word, ink: stimulus.ink }
      expect(currentPattern).not.toEqual(previousStroopPattern)
      expect(stimulus.word).not.toBe('red')
      expect(stimulus.ink).not.toBe('red')
      stroopPatterns.push(currentPattern)
      previousStroopPattern = currentPattern
    }
    expect(stroopPatterns[0].word).toBe(stroopPatterns[1].word)
    expect(stroopPatterns[1].ink).toBe(stroopPatterns[2].ink)

    vi.restoreAllMocks()
    mockRandomValues([
      0, 0.9, 0, 0.9, 0.9, 0, 0.9,
      0, 0.9, 0, 0.9, 0.9, 0, 0.9,
      0.9, 0.9, 0, 0.9, 0, 0.9, 0,
    ])

    let previousFlankerPattern: Parameters<typeof createFlankerStimulus>[1] = null
    const flankerPatterns = []
    for (let index = 0; index < 8; index += 1) {
      const stimulus = createFlankerStimulus(0.5, previousFlankerPattern)
      const currentPattern = {
        arrows: stimulus.arrows,
      }

      expect(currentPattern).not.toEqual(previousFlankerPattern)
      expect(stimulus.arrows).toHaveLength(7)
      expect(stimulus.targetDirection).toBe(stimulus.arrows[3])
      flankerPatterns.push(currentPattern)
      previousFlankerPattern = currentPattern
    }
    expect(
      flankerPatterns.some((pattern) => {
        const flankers = pattern.arrows.filter((_, index) => index !== 3)

        return new Set(flankers).size > 1
      }),
    ).toBe(true)
  })

  it('el generador CPT respeta distancia mínima y máxima variable entre X', () => {
    const observedGaps: number[] = []

    for (
      let nextTargetGap = 1;
      nextTargetGap <= CPT_MAX_NON_TARGETS_BETWEEN_TARGETS;
      nextTargetGap += 1
    ) {
      let state: CptGenerationState = {
        previousLetter: 'X',
        nonTargetsSinceLastTarget: 0,
        nextTargetGap,
      }
      const letters: string[] = []

      while (!letters.includes('X')) {
        const nextLetter = getNextCptLetter(0, state)
        letters.push(nextLetter.letter)
        state = nextLetter.state
      }

      expect(letters.at(-1)).toBe('X')
      expect(letters.slice(0, -1)).not.toContain('X')
      expect(letters.slice(0, -1)).toHaveLength(nextTargetGap)
      observedGaps.push(letters.length - 1)

      for (let index = 1; index < letters.length; index += 1) {
        expect(letters[index]).not.toBe(letters[index - 1])
      }
    }

    expect(observedGaps).toEqual([1, 2, 3, 4])

    const initialState = createInitialCptGenerationState()
    expect(initialState.nextTargetGap).toBeLessThanOrEqual(
      CPT_MAX_NON_TARGETS_BETWEEN_TARGETS,
    )
  })
})
