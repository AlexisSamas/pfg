import type { StroopColorKey } from './stroopColors'

export const TARGET_LETTER = 'X'
const NON_TARGET_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWYZ'.split('')
export const CPT_MAX_NON_TARGETS_BETWEEN_TARGETS = 4

export type CptGenerationState = {
  previousLetter: string | null
  nonTargetsSinceLastTarget: number
  nextTargetGap: number
}

export type StroopStimulusType = 'congruent' | 'incongruent'
export type GeneratedStroopStimulus = {
  word: StroopColorKey
  ink: StroopColorKey
  stimulusType: StroopStimulusType
  startedAt: number
  responded: boolean
}

export type StroopPattern = Pick<GeneratedStroopStimulus, 'word' | 'ink'>

export type Direction = 'left' | 'right'
export type FlankerStimulusType = 'congruent' | 'incongruent'
export type GeneratedFlankerStimulus = {
  arrows: Direction[]
  targetDirection: Direction
  stimulusType: FlankerStimulusType
  startedAt: number
  responded: boolean
}

export type FlankerPattern = {
  arrows: Direction[]
}

const FLANKER_ARROW_COUNT = 7
export const FLANKER_TARGET_INDEX = 3

function getRandomCptTargetGap(): number {
  return 1 + Math.floor(Math.random() * CPT_MAX_NON_TARGETS_BETWEEN_TARGETS)
}

function getRandomCptInitialTargetGap(): number {
  return Math.floor(Math.random() * (CPT_MAX_NON_TARGETS_BETWEEN_TARGETS + 1))
}

function getRandomCptNonTarget(previousLetter?: string | null): string {
  const availableLetters = NON_TARGET_LETTERS.filter(
    (letter) => letter !== previousLetter,
  )
  const letterPool = availableLetters.length > 0
    ? availableLetters
    : NON_TARGET_LETTERS
  const index = Math.floor(Math.random() * letterPool.length)

  return letterPool[index]
}

export function createInitialCptGenerationState(): CptGenerationState {
  return {
    previousLetter: null,
    nonTargetsSinceLastTarget: 0,
    nextTargetGap: getRandomCptInitialTargetGap(),
  }
}

export function getNextCptLetter(
  targetProbability: number,
  state: CptGenerationState,
): { letter: string; state: CptGenerationState } {
  const hasMinimumGap = state.previousLetter !== TARGET_LETTER
  const mustShowTarget =
    hasMinimumGap && state.nonTargetsSinceLastTarget >= state.nextTargetGap
  const shouldShowTarget =
    mustShowTarget || (hasMinimumGap && Math.random() < targetProbability)

  if (shouldShowTarget) {
    return {
      letter: TARGET_LETTER,
      state: {
        previousLetter: TARGET_LETTER,
        nonTargetsSinceLastTarget: 0,
        nextTargetGap: getRandomCptTargetGap(),
      },
    }
  }

  const letter = getRandomCptNonTarget(state.previousLetter)

  return {
    letter,
    state: {
      ...state,
      previousLetter: letter,
      nonTargetsSinceLastTarget: state.nonTargetsSinceLastTarget + 1,
    },
  }
}

function getStroopPatterns(
  availableColors: StroopColorKey[],
  isIncongruent: boolean,
): StroopPattern[] {
  return availableColors.flatMap((word) =>
    availableColors
      .filter((ink) => (isIncongruent ? ink !== word : ink === word))
      .map((ink) => ({ word, ink })),
  )
}

function isSameStroopPattern(
  pattern: StroopPattern,
  previousPattern?: StroopPattern | null,
): boolean {
  return (
    pattern.word === previousPattern?.word &&
    pattern.ink === previousPattern.ink
  )
}

export function createStroopStimulus(
  incongruentProbability: number,
  availableColors: StroopColorKey[],
  previousPattern?: StroopPattern | null,
): GeneratedStroopStimulus {
  const isIncongruent = Math.random() < incongruentProbability
  const patterns = getStroopPatterns(availableColors, isIncongruent)
  const availablePatterns = patterns.filter(
    (pattern) => !isSameStroopPattern(pattern, previousPattern),
  )
  const patternPool = availablePatterns.length > 0 ? availablePatterns : patterns
  const index = Math.floor(Math.random() * patternPool.length)
  const { word, ink } = patternPool[index]

  return {
    word,
    ink,
    stimulusType: isIncongruent ? 'incongruent' : 'congruent',
    startedAt: performance.now(),
    responded: false,
  }
}

function getRandomDirection(): Direction {
  return Math.random() < 0.5 ? 'left' : 'right'
}

function createRandomFlankerPattern(): FlankerPattern {
  return {
    arrows: Array.from({ length: FLANKER_ARROW_COUNT }, () => getRandomDirection()),
  }
}

function isSameFlankerPattern(
  pattern: FlankerPattern,
  previousPattern?: FlankerPattern | null,
): boolean {
  return pattern.arrows.every(
    (direction, index) => direction === previousPattern?.arrows[index],
  )
}

function createFallbackFlankerPattern(previousPattern: FlankerPattern): FlankerPattern {
  const [firstDirection, ...restDirections] = previousPattern.arrows

  return {
    arrows: [
      firstDirection === 'left' ? 'right' : 'left',
      ...restDirections,
    ],
  }
}

export function createFlankerStimulus(
  incongruentProbability: number,
  previousPattern?: FlankerPattern | null,
): GeneratedFlankerStimulus {
  void incongruentProbability

  let pattern = createRandomFlankerPattern()
  let attempts = 0

  while (
    previousPattern &&
    isSameFlankerPattern(pattern, previousPattern) &&
    attempts < 8
  ) {
    pattern = createRandomFlankerPattern()
    attempts += 1
  }

  if (previousPattern && isSameFlankerPattern(pattern, previousPattern)) {
    pattern = createFallbackFlankerPattern(previousPattern)
  }

  const targetDirection = pattern.arrows[FLANKER_TARGET_INDEX]
  const isCongruent = pattern.arrows.every(
    (direction) => direction === targetDirection,
  )

  return {
    arrows: pattern.arrows,
    targetDirection,
    stimulusType: isCongruent ? 'congruent' : 'incongruent',
    startedAt: performance.now(),
    responded: false,
  }
}
