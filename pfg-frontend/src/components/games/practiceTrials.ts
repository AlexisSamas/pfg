import {
  createFlankerStimulus,
  createInitialCptGenerationState,
  createStroopStimulus,
  FLANKER_TARGET_INDEX,
  getNextCptLetter,
  TARGET_LETTER,
  type CptGenerationState,
  type Direction,
  type FlankerPattern,
  type StroopPattern,
} from './stimulusGenerators'
import {
  getAvailableStroopColors,
  STROOP_COLORS,
  type StroopColorKey,
  type ColorBlindMode,
} from './stroopColors'

export type { ColorBlindMode } from './stroopColors'

export const PRACTICE_TRIAL_LIMIT = 10

export type PracticeGameKind = 'cpt' | 'stroop' | 'flanker'
export type FeedbackKind = 'correct' | 'incorrect' | 'timeout'

export type PracticeTrial = {
  stimulus: string
  expectedCode: string | null
  timeoutFeedback: FeedbackKind
  controls: string[]
  validCodes: string[]
  cssColor?: string
  flankerParts?: string[]
}

export const GAME_LABELS: Record<PracticeGameKind, string> = {
  cpt: 'CPT',
  stroop: 'Stroop',
  flanker: 'Flanker',
}

function directionToArrow(direction: Direction): string {
  return direction === 'left' ? '<' : '>'
}

function createCptTrial(letter: string): PracticeTrial {
  const isTarget = letter === TARGET_LETTER
  return {
    stimulus: letter,
    expectedCode: isTarget ? 'Space' : null,
    timeoutFeedback: isTarget ? 'timeout' : 'correct',
    controls: [
      'Barra espaciadora = responder si aparece X',
      'No pulses si aparece otra letra',
    ],
    validCodes: ['Space'],
  }
}

export function generateCptPracticeTrials(
  trialLimit = PRACTICE_TRIAL_LIMIT,
): PracticeTrial[] {
  let generationState: CptGenerationState = createInitialCptGenerationState()

  return Array.from({ length: trialLimit }, () => {
    const nextLetter = getNextCptLetter(0.25, generationState)
    generationState = nextLetter.state

    return createCptTrial(nextLetter.letter)
  })
}

export function getCptTrial(trialIndex: number): PracticeTrial {
  return generateCptPracticeTrials()[trialIndex % PRACTICE_TRIAL_LIMIT]
}

function createStroopPracticeTrial(
  word: StroopColorKey,
  ink: StroopColorKey,
  availableColors: StroopColorKey[],
): PracticeTrial {
  return {
    stimulus: STROOP_COLORS[word].label,
    expectedCode: STROOP_COLORS[ink].key,
    timeoutFeedback: 'timeout',
    controls: availableColors.map((color) => STROOP_COLORS[color].controlLabel),
    validCodes: availableColors.map((color) => STROOP_COLORS[color].key),
    cssColor: STROOP_COLORS[ink].cssColor,
  }
}

export function generateStroopPracticeTrials(
  trialLimit = PRACTICE_TRIAL_LIMIT,
  colorBlindMode?: ColorBlindMode,
): PracticeTrial[] {
  const availableColors = getAvailableStroopColors(colorBlindMode)
  let previousPattern: StroopPattern | null = null

  return Array.from({ length: trialLimit }, () => {
    const stimulus = createStroopStimulus(0.5, availableColors, previousPattern)
    previousPattern = {
      word: stimulus.word,
      ink: stimulus.ink,
    }

    return createStroopPracticeTrial(
      stimulus.word,
      stimulus.ink,
      availableColors,
    )
  })
}

export function getStroopTrial(
  trialIndex: number,
  colorBlindMode?: ColorBlindMode,
): PracticeTrial {
  return generateStroopPracticeTrials(PRACTICE_TRIAL_LIMIT, colorBlindMode)[
    trialIndex % PRACTICE_TRIAL_LIMIT
  ]
}

function createFlankerPracticeTrial(arrows: Direction[]): PracticeTrial {
  const flankerParts = arrows.map(directionToArrow)
  const targetDirection = arrows[FLANKER_TARGET_INDEX]

  return {
    stimulus: flankerParts.join(' '),
    expectedCode: targetDirection === 'left' ? 'ArrowLeft' : 'ArrowRight',
    timeoutFeedback: 'timeout',
    controls: [],
    validCodes: ['ArrowLeft', 'ArrowRight'],
    flankerParts,
  }
}

export function generateFlankerPracticeTrials(
  trialLimit = PRACTICE_TRIAL_LIMIT,
): PracticeTrial[] {
  let previousPattern: FlankerPattern | null = null

  return Array.from({ length: trialLimit }, () => {
    const stimulus = createFlankerStimulus(0.5, previousPattern)
    previousPattern = {
      arrows: stimulus.arrows,
    }

    return createFlankerPracticeTrial(stimulus.arrows)
  })
}

export function getFlankerTrial(trialIndex: number): PracticeTrial {
  return generateFlankerPracticeTrials()[trialIndex % PRACTICE_TRIAL_LIMIT]
}

export function getPracticeTrial(
  game: PracticeGameKind,
  trialIndex: number,
  colorBlindMode?: ColorBlindMode,
): PracticeTrial {
  if (game === 'cpt') {
    return getCptTrial(trialIndex)
  }

  if (game === 'stroop') {
    return getStroopTrial(trialIndex, colorBlindMode)
  }

  return getFlankerTrial(trialIndex)
}
