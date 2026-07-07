import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameEvent, ScoringResult } from '../types'
import { StartEvaluationPage } from './StartEvaluationPage'

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  evaluationValue: undefined as unknown,
  getResult: vi.fn(),
  logout: vi.fn(),
  navigate: vi.fn(),
  sendEvents: vi.fn(),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()

  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  }
})

vi.mock('../api', () => ({
  createSession: mocks.createSession,
  getResult: mocks.getResult,
  sendEvents: mocks.sendEvents,
}))

vi.mock('../context', () => ({
  useAuth: () => ({
    login: vi.fn(),
    logout: mocks.logout,
  }),
  useEvaluation: () => mocks.evaluationValue,
}))

vi.mock('../components', () => ({
  CPTGame: ({ onComplete }: { onComplete?: (events: GameEvent[]) => void }) => (
    <section>
      <p>CPT real</p>
      <button
        type="button"
        onClick={() =>
          onComplete?.([
            {
              game_type: 'cpt',
              event_type: 'hit',
              timestamp_us: 1,
              reaction_time_ms: 250,
              is_correct: true,
              stimulus_type: 'target',
            },
          ])
        }
      >
        Finalizar CPT
      </button>
    </section>
  ),
  FlankerGame: ({
    onComplete,
    trialMs,
  }: {
    onComplete?: (events: GameEvent[]) => void
    trialMs?: number
  }) => (
    <section>
      <p>Flanker real</p>
      <p>Ritmo Flanker: {trialMs}</p>
      <button
        type="button"
        onClick={() =>
          onComplete?.([
            {
              game_type: 'flanker',
              event_type: 'hit',
              timestamp_us: 3,
              reaction_time_ms: 280,
              is_correct: true,
              stimulus_type: 'congruent',
            },
          ])
        }
      >
        Finalizar Flanker
      </button>
    </section>
  ),
  GameInstructions: ({
    compact,
    controls,
    title,
    onStart,
  }: {
    compact?: boolean
    controls: string[]
    title: string
    onStart: () => void
  }) => (
    <section data-compact={compact ? 'true' : 'false'}>
      <h1>{title}</h1>
      <ul>
        {controls.map((control) => (
          <li key={control}>{control}</li>
        ))}
      </ul>
      <button type="button" onClick={onStart}>
        Comenzar práctica
      </button>
    </section>
  ),
  PracticeGame: ({
    colorBlindMode,
    game,
    onComplete,
    onPracticeComplete,
  }: {
    colorBlindMode?: { enabled: boolean; excludedColor?: string }
    game: string
    onComplete: () => void
    onPracticeComplete?: () => void
  }) => (
    <section>
      <h1>Práctica {game}</h1>
      {colorBlindMode?.enabled && (
        <p>Color excluido: {colorBlindMode.excludedColor}</p>
      )}
      <button type="button" onClick={onPracticeComplete}>
        Completar práctica
      </button>
      <button type="button" onClick={onComplete}>
        Comenzar evaluación real
      </button>
    </section>
  ),
  StroopGame: ({
    onComplete,
    trialMs,
  }: {
    onComplete?: (events: GameEvent[]) => void
    trialMs?: number
  }) => (
    <section>
      <p>Stroop real</p>
      <p>Ritmo Stroop: {trialMs}</p>
      <button
        type="button"
        onClick={() =>
          onComplete?.([
            {
              game_type: 'stroop',
              event_type: 'correct',
              timestamp_us: 2,
              reaction_time_ms: 300,
              is_correct: true,
              stimulus_type: 'congruent',
            },
          ])
        }
      >
        Finalizar Stroop
      </button>
    </section>
  ),
}))

const realEvent: GameEvent = {
  game_type: 'cpt',
  event_type: 'hit',
  timestamp_us: 1,
  reaction_time_ms: 250,
  is_correct: true,
  stimulus_type: 'target',
}

const result: ScoringResult = {
  id: 1,
  session_id: 42,
  trm_ms: 250,
  d_prime: 1.1,
  stroop_effect_ms: 100,
  flanker_effect_ms: 80,
  stroop_error_rate: 0.1,
  flanker_accuracy: 0.9,
  score: 80,
  decision: 'ACCESO',
  weakest_metric: 'stroop_effect_ms',
  recommendation_key: 'high_stroop_effect',
  computed_at: '2026-06-10T10:00:00',
}

function setEvaluationValue(overrides: Record<string, unknown>) {
  mocks.evaluationValue = {
    accumulatedEvents: [],
    clearEvaluation: vi.fn(),
    contextId: 'exam_demo_01',
    currentGame: null,
    sessionId: null,
    setCurrentGame: vi.fn((game: unknown) => {
      const evaluationValue = mocks.evaluationValue as { currentGame: unknown }

      evaluationValue.currentGame = game
    }),
    setResult: vi.fn(),
    startEvaluation: vi.fn(),
    ...overrides,
  }

  return mocks.evaluationValue as {
    clearEvaluation: ReturnType<typeof vi.fn>
    setCurrentGame: ReturnType<typeof vi.fn>
  }
}

function renderStartEvaluationPage() {
  return render(
    <MemoryRouter>
      <StartEvaluationPage />
    </MemoryRouter>,
  )
}

function storeEvaluationFlow({
  currentGame,
  gamePhase,
  stroopColorBlindMode = { enabled: false, excludedColor: 'blue' },
}: {
  currentGame: 'cpt' | 'stroop' | 'flanker' | 'completed' | null
  gamePhase:
    | 'accessibility'
    | 'instructions'
    | 'practice'
    | 'practice-completed'
    | 'running'
    | 'completed'
  stroopColorBlindMode?: { enabled: boolean; excludedColor?: string }
}) {
  sessionStorage.setItem(
    'pfg_evaluation_flow',
    JSON.stringify({
      currentGame,
      gamePhase,
      stroopColorBlindMode,
    }),
  )
}

describe('StartEvaluationPage', () => {
  beforeEach(() => {
    sessionStorage.clear()
    mocks.createSession.mockReset()
    mocks.getResult.mockReset()
    mocks.logout.mockReset()
    mocks.navigate.mockReset()
    mocks.sendEvents.mockReset()
  })

  it('pasa de práctica a evaluación real sin enviar eventos al backend', () => {
    setEvaluationValue({
      currentGame: 'cpt',
      sessionId: 42,
    })

    renderStartEvaluationPage()

    fireEvent.click(screen.getByRole('button', { name: /Comenzar práctica/i }))
    expect(
      screen.getByRole('heading', { name: /Práctica cpt/i }),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: /Comenzar evaluación real/i }),
    )

    expect(screen.getByText('CPT real')).toBeInTheDocument()
    expect(mocks.sendEvents).not.toHaveBeenCalled()
  })

  it('no muestra la opción de probar la secuencia sin crear sesión', () => {
    setEvaluationValue({})

    renderStartEvaluationPage()

    expect(
      screen.queryByRole('button', {
        name: /Probar secuencia sin crear sesión/i,
      }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/Flujo:/i)).not.toBeInTheDocument()
  })

  it('rehidrata la práctica CPT tras refrescar sin enviar eventos', () => {
    storeEvaluationFlow({ currentGame: 'cpt', gamePhase: 'practice' })
    setEvaluationValue({
      currentGame: 'cpt',
      sessionId: 42,
    })

    renderStartEvaluationPage()

    expect(
      screen.getByRole('heading', { name: /Práctica cpt/i }),
    ).toBeInTheDocument()
    expect(mocks.sendEvents).not.toHaveBeenCalled()
  })

  it.each([
    ['cpt', 'CPT', 'CPT real'],
    ['stroop', 'Stroop', 'Stroop real'],
    ['flanker', 'Flanker', 'Flanker real'],
  ] as const)(
    'rehidrata la pantalla post-práctica de %s sin reiniciar la práctica',
    (currentGame, gameName, realGameText) => {
      storeEvaluationFlow({ currentGame, gamePhase: 'practice' })
      setEvaluationValue({
        currentGame,
        sessionId: 42,
      })

      const { unmount } = renderStartEvaluationPage()

      expect(
        screen.getByRole('heading', { name: new RegExp(`^Práctica ${currentGame}$`, 'i') }),
      ).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /Completar práctica/i }))

      expect(
        screen.getByRole('heading', {
          name: new RegExp(`Práctica ${gameName} completada`, 'i'),
        }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /Comenzar evaluación real/i }),
      ).toBeInTheDocument()

      expect(JSON.parse(sessionStorage.getItem('pfg_evaluation_flow') ?? '{}')).toMatchObject({
        currentGame,
        gamePhase: 'practice-completed',
      })

      unmount()
      setEvaluationValue({
        currentGame,
        sessionId: 42,
      })

      renderStartEvaluationPage()

      expect(
        screen.getByRole('heading', {
          name: new RegExp(`Práctica ${gameName} completada`, 'i'),
        }),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('heading', {
          name: new RegExp(`^Práctica ${currentGame}$`, 'i'),
        }),
      ).not.toBeInTheDocument()

      fireEvent.click(
        screen.getByRole('button', { name: /Comenzar evaluación real/i }),
      )

      expect(screen.getByText(realGameText)).toBeInTheDocument()
      if (currentGame === 'stroop') {
        expect(screen.getByText('Ritmo Stroop: 1000')).toBeInTheDocument()
      }
      if (currentGame === 'flanker') {
        expect(screen.getByText('Ritmo Flanker: 1000')).toBeInTheDocument()
      }
    },
  )

  it('rehidrata la evaluación real CPT tras refrescar', () => {
    storeEvaluationFlow({ currentGame: 'cpt', gamePhase: 'running' })
    setEvaluationValue({
      currentGame: 'cpt',
      sessionId: 42,
    })

    renderStartEvaluationPage()

    expect(screen.getByText('CPT real')).toBeInTheDocument()
    expect(mocks.navigate).not.toHaveBeenCalledWith('/', { replace: true })
  })

  it('rehidrata el panel post-CPT tras refrescar', () => {
    storeEvaluationFlow({ currentGame: 'cpt', gamePhase: 'completed' })
    setEvaluationValue({
      currentGame: 'cpt',
      sessionId: 42,
    })

    renderStartEvaluationPage()

    expect(
      screen.getByRole('heading', { name: /CPT finalizado/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Continuar a Stroop/i }),
    ).toBeInTheDocument()
  })

  it('rehidrata accesibilidad Stroop tras refrescar', () => {
    storeEvaluationFlow({
      currentGame: 'stroop',
      gamePhase: 'accessibility',
      stroopColorBlindMode: { enabled: true, excludedColor: 'red' },
    })
    setEvaluationValue({
      currentGame: 'stroop',
      sessionId: 42,
    })

    renderStartEvaluationPage()

    expect(
      screen.getByRole('group', { name: /Accesibilidad visual/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: /Gama de color a excluir/i }),
    ).toHaveValue('red')
  })

  it('rehidrata instrucciones Stroop con modo daltónico y compacto tras refrescar', () => {
    storeEvaluationFlow({
      currentGame: 'stroop',
      gamePhase: 'instructions',
      stroopColorBlindMode: { enabled: true, excludedColor: 'red' },
    })
    setEvaluationValue({
      currentGame: 'stroop',
      sessionId: 42,
    })

    renderStartEvaluationPage()

    expect(
      screen.getByRole('heading', { name: /Stroop: color e inhibición/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('B: azul, G: verde, Y: amarillo')).toBeInTheDocument()
    expect(screen.getByRole('heading').closest('section')).toHaveAttribute(
      'data-compact',
      'true',
    )
  })

  it('vuelve a la pantalla segura de inicio si el estado guardado no tiene sesión activa', () => {
    storeEvaluationFlow({ currentGame: 'cpt', gamePhase: 'running' })
    setEvaluationValue({})

    renderStartEvaluationPage()

    expect(
      screen.getByRole('heading', { name: /Iniciar evaluación cognitiva/i }),
    ).toBeInTheDocument()
    expect(screen.queryByText('CPT real')).not.toBeInTheDocument()
  })

  it('muestra loading de creación de sesión sin mencionar backend', async () => {
    mocks.createSession.mockReturnValue(new Promise(() => undefined))
    setEvaluationValue({})

    renderStartEvaluationPage()

    fireEvent.click(screen.getByRole('button', { name: /Realizar intento/i }))

    expect(
      await screen.findByRole('button', { name: /Creando sesión\.\.\./i }),
    ).toBeDisabled()
    expect(
      screen.queryByRole('button', {
        name: /Creando sesión en el backend\.\.\./i,
      }),
    ).not.toBeInTheDocument()
  })

  it.each([
    ['cpt', 'CPT real', /Juego 1 de 3/i],
    ['stroop', 'Stroop real', /Juego 2 de 3/i],
    ['flanker', 'Flanker real', /Juego 3 de 3/i],
  ] as const)(
    'no muestra la burbuja flotante durante %s',
    (currentGame, gameText, progressLabel) => {
      setEvaluationValue({
        currentGame,
        sessionId: 42,
      })

      renderStartEvaluationPage()

      expect(
        screen.getByRole('button', { name: /Comenzar práctica/i }),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /^Comenzar$/i }),
      ).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /Comenzar práctica/i }))
      fireEvent.click(
        screen.getByRole('button', { name: /Comenzar evaluación real/i }),
      )

      expect(screen.getByText(gameText)).toBeInTheDocument()
      expect(screen.queryByText(progressLabel)).not.toBeInTheDocument()
    },
  )

  it('quita la instrucción de duda en CPT', () => {
    setEvaluationValue({
      currentGame: 'cpt',
      sessionId: 42,
    })

    renderStartEvaluationPage()

    expect(
      screen.queryByText(/Si dudas, espera al siguiente estímulo/i),
    ).not.toBeInTheDocument()
  })

  it('al pulsar atrás en instrucciones CPT vuelve a la pantalla general', () => {
    const evaluationValue = setEvaluationValue({
      currentGame: 'cpt',
      sessionId: null,
    })

    renderStartEvaluationPage()

    act(() => {
      window.dispatchEvent(new Event('popstate'))
    })

    expect(evaluationValue.setCurrentGame).toHaveBeenCalledWith(null)
  })

  it('al pulsar atrás durante práctica vuelve a instrucciones sin aviso', () => {
    setEvaluationValue({
      currentGame: 'cpt',
      sessionId: 42,
    })

    renderStartEvaluationPage()

    fireEvent.click(screen.getByRole('button', { name: /Comenzar práctica/i }))
    expect(
      screen.getByRole('heading', { name: /Práctica cpt/i }),
    ).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new Event('popstate'))
    })

    expect(
      screen.getByRole('heading', { name: /CPT: atención sostenida/i }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('al pulsar atrás durante evaluación real muestra aviso y permite permanecer', () => {
    setEvaluationValue({
      currentGame: 'cpt',
      sessionId: 42,
    })

    renderStartEvaluationPage()

    fireEvent.click(screen.getByRole('button', { name: /Comenzar práctica/i }))
    fireEvent.click(
      screen.getByRole('button', { name: /Comenzar evaluación real/i }),
    )

    expect(screen.getByText('CPT real')).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new Event('popstate'))
    })

    expect(
      screen.getByText(/Hay una prueba en curso/i),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Permanecer/i }))

    expect(screen.getByText('CPT real')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('al confirmar salida durante evaluación real vuelve a inicio', () => {
    const evaluationValue = setEvaluationValue({
      currentGame: 'cpt',
      sessionId: 42,
    })

    renderStartEvaluationPage()

    fireEvent.click(screen.getByRole('button', { name: /Comenzar práctica/i }))
    fireEvent.click(
      screen.getByRole('button', { name: /Comenzar evaluación real/i }),
    )
    act(() => {
      window.dispatchEvent(new Event('popstate'))
    })
    fireEvent.click(screen.getByRole('button', { name: /Salir de la prueba/i }))

    expect(evaluationValue.clearEvaluation).toHaveBeenCalled()
    expect(mocks.navigate).toHaveBeenCalledWith('/', {
      replace: true,
      state: { refreshStudentStatus: true },
    })
  })

  it('al pulsar atrás tras completar CPT muestra aviso de evaluación y permite permanecer', () => {
    setEvaluationValue({
      currentGame: 'cpt',
      sessionId: 42,
    })

    renderStartEvaluationPage()

    fireEvent.click(screen.getByRole('button', { name: /Comenzar práctica/i }))
    fireEvent.click(
      screen.getByRole('button', { name: /Comenzar evaluación real/i }),
    )
    fireEvent.click(screen.getByRole('button', { name: /Finalizar CPT/i }))

    expect(screen.getByRole('heading', { name: /CPT finalizado/i })).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new Event('popstate'))
    })

    expect(
      screen.getByRole('heading', { name: /Evaluación en curso/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /Hay una evaluación en curso\. Si sales ahora, perderás el progreso actual\./i,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Salir de la evaluación/i }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Permanecer/i }))

    expect(screen.getByRole('heading', { name: /CPT finalizado/i })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('al confirmar salida tras completar Stroop vuelve a inicio', () => {
    const evaluationValue = setEvaluationValue({
      currentGame: 'stroop',
      sessionId: 42,
    })

    renderStartEvaluationPage()

    fireEvent.click(screen.getByRole('button', { name: /Comenzar práctica/i }))
    fireEvent.click(
      screen.getByRole('button', { name: /Comenzar evaluación real/i }),
    )
    fireEvent.click(screen.getByRole('button', { name: /Finalizar Stroop/i }))

    expect(
      screen.getByRole('heading', { name: /Stroop finalizado/i }),
    ).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new Event('popstate'))
    })

    expect(
      screen.getByRole('heading', { name: /Evaluación en curso/i }),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: /Salir de la evaluación/i }),
    )

    expect(evaluationValue.clearEvaluation).toHaveBeenCalled()
    expect(mocks.navigate).toHaveBeenCalledWith('/', {
      replace: true,
      state: { refreshStudentStatus: true },
    })
  })

  it('muestra texto genérico de eventos guardados tras Stroop', () => {
    setEvaluationValue({
      currentGame: 'stroop',
      sessionId: 42,
    })

    renderStartEvaluationPage()

    fireEvent.click(screen.getByRole('button', { name: /Comenzar práctica/i }))
    fireEvent.click(
      screen.getByRole('button', { name: /Comenzar evaluación real/i }),
    )
    fireEvent.click(screen.getByRole('button', { name: /Finalizar Stroop/i }))

    expect(
      screen.getByText('Se han guardado los eventos en la evaluación actual.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Se han guardado \d+ eventos/i)).not.toBeInTheDocument()
  })

  it('envía al backend los eventos reales acumulados al completar la evaluación', async () => {
    mocks.sendEvents.mockResolvedValue({ received: 1 })
    mocks.getResult.mockResolvedValue(result)
    setEvaluationValue({
      accumulatedEvents: [realEvent],
      currentGame: 'completed',
      sessionId: 42,
    })

    renderStartEvaluationPage()

    await waitFor(() => {
      expect(mocks.sendEvents).toHaveBeenCalledWith(42, {
        events: [realEvent],
      })
    })
  })

  it('muestra envío de datos sin mencionar backend durante el envío final', async () => {
    mocks.sendEvents.mockReturnValue(new Promise(() => undefined))
    setEvaluationValue({
      accumulatedEvents: [realEvent],
      currentGame: 'completed',
      sessionId: 42,
    })

    renderStartEvaluationPage()

    expect(await screen.findByText(/Enviando datos/i)).toBeInTheDocument()
    expect(screen.queryByText(/Enviando eventos al backend/i)).not.toBeInTheDocument()
  })

  it('navega a resultados tras enviar eventos correctamente', async () => {
    mocks.sendEvents.mockResolvedValue({ received: 1 })
    setEvaluationValue({
      accumulatedEvents: [realEvent],
      currentGame: 'completed',
      sessionId: 42,
    })

    renderStartEvaluationPage()

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith('/result', { replace: true })
    })
    expect(mocks.getResult).not.toHaveBeenCalled()
  })

  it('muestra accesibilidad Stroop tras post-CPT y confirma hacia instrucciones', () => {
    setEvaluationValue({
      currentGame: 'cpt',
      sessionId: 42,
    })

    renderStartEvaluationPage()

    fireEvent.click(screen.getByRole('button', { name: /Comenzar práctica/i }))
    fireEvent.click(
      screen.getByRole('button', { name: /Comenzar evaluación real/i }),
    )
    fireEvent.click(screen.getByRole('button', { name: /Finalizar CPT/i }))
    fireEvent.click(screen.getByRole('button', { name: /Continuar a Stroop/i }))

    expect(
      screen.getByRole('group', { name: /Accesibilidad visual/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'No' })).toBeChecked()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Confirmar/i }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Confirmar/i }))

    expect(
      screen.getByRole('heading', { name: /Stroop: color e inhibición/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('group', { name: /Accesibilidad visual/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText('R: rojo, B: azul, G: verde, Y: amarillo'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Controles: R/i)).not.toBeInTheDocument()
  })

  it('conserva modo daltónico Stroop al pasar a instrucciones y práctica', () => {
    setEvaluationValue({
      currentGame: 'cpt',
      sessionId: 42,
    })

    renderStartEvaluationPage()

    fireEvent.click(screen.getByRole('button', { name: /Comenzar práctica/i }))
    fireEvent.click(
      screen.getByRole('button', { name: /Comenzar evaluación real/i }),
    )
    fireEvent.click(screen.getByRole('button', { name: /Finalizar CPT/i }))
    fireEvent.click(screen.getByRole('button', { name: /Continuar a Stroop/i }))

    fireEvent.click(screen.getByRole('radio', { name: 'Sí' }))

    expect(
      screen.getByRole('combobox', { name: /Gama de color a excluir/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Gama azul' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Gama roja' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Gama verde' })).toBeInTheDocument()

    fireEvent.change(
      screen.getByRole('combobox', { name: /Gama de color a excluir/i }),
      { target: { value: 'red' } },
    )
    fireEvent.click(screen.getByRole('button', { name: /Confirmar/i }))

    expect(screen.getByText('B: azul, G: verde, Y: amarillo')).toBeInTheDocument()
    expect(
      screen.queryByText('R: rojo, B: azul, G: verde, Y: amarillo'),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Comenzar práctica/i }))

    expect(screen.getByText('Color excluido: red')).toBeInTheDocument()
  })

  it('al volver desde accesibilidad Stroop mantiene el conteo post-CPT', () => {
    setEvaluationValue({
      accumulatedEvents: [realEvent],
      currentGame: 'cpt',
      sessionId: 42,
    })

    renderStartEvaluationPage()

    fireEvent.click(screen.getByRole('button', { name: /Comenzar práctica/i }))
    fireEvent.click(
      screen.getByRole('button', { name: /Comenzar evaluación real/i }),
    )
    fireEvent.click(screen.getByRole('button', { name: /Finalizar CPT/i }))

    expect(
      screen.getByText('Se han guardado los eventos en la evaluación actual.'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Continuar a Stroop/i }))

    act(() => {
      window.dispatchEvent(new Event('popstate'))
    })

    expect(
      screen.getByText('Se han guardado los eventos en la evaluación actual.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Se han guardado \d+ eventos/i)).not.toBeInTheDocument()
  })

  it('muestra aviso al volver desde instrucciones CPT si el intento ya existe', () => {
    const evaluationValue = setEvaluationValue({
      currentGame: 'cpt',
      sessionId: 42,
    })

    renderStartEvaluationPage()

    act(() => {
      window.dispatchEvent(new Event('popstate'))
    })

    expect(screen.getByText(/Hay una prueba en curso/i)).toBeInTheDocument()
    expect(evaluationValue.setCurrentGame).not.toHaveBeenCalledWith(null)

    fireEvent.click(screen.getByRole('button', { name: /Permanecer/i }))

    expect(
      screen.getByRole('heading', { name: /CPT: atención sostenida/i }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
