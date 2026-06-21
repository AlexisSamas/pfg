import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventType, GameEvent, StimulusType } from '../../types'
import { CPTGame } from './CPTGame'
import { FlankerGame } from './FlankerGame'
import { StroopGame } from './StroopGame'

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

  it('CPTGame genera hit, miss, false_alarm y correct_rejection', () => {
    mockRandomValues([
      0.1, // target: hit
      0.1, // target: miss
      0.9, 0, // non-target: false_alarm
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
    advanceTimers(10)
    fireEvent.keyDown(window, { code: 'Space' })
    advanceTimers(90)
    advanceTimers(100)

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
      0, 0.9, // red congruent: correct
      0, 0.1, 0, // red word, blue ink: error
      0, 0.1, 0, // red word, blue ink: timeout
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
      0, 0.9, // first available color is blue when red is excluded
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
    expect(screen.getByText('B = azul')).toBeInTheDocument()

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

  it('FlankerGame genera hit, error, timeout, congruent e incongruent', () => {
    mockRandomValues([
      0.1, 0.9, // left congruent: hit
      0.1, 0.1, // left target, right flankers: error
      0.9, 0.1, // right target, left flankers: timeout
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
    fireEvent.keyDown(window, { code: 'ArrowRight' })
    advanceTimers(90)
    advanceTimers(100)

    expectEventTypes(['hit', 'error', 'timeout'])
    expectStimulusTypes(['congruent', 'incongruent'])
    expectPositiveReactionTime()
  })
})
