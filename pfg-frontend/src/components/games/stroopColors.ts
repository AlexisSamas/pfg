export type StroopColorKey = 'red' | 'blue' | 'green' | 'yellow'
export type ExcludableStroopColor = Exclude<StroopColorKey, 'yellow'>

export type ColorBlindMode = {
  enabled: boolean
  excludedColor?: ExcludableStroopColor
}

export const STROOP_COLORS: Record<
  StroopColorKey,
  { label: string; cssColor: string; key: string; controlLabel: string }
> = {
  red: {
    label: 'ROJO',
    cssColor: '#dc2626',
    key: 'KeyR',
    controlLabel: 'R = rojo',
  },
  blue: {
    label: 'AZUL',
    cssColor: '#2563eb',
    key: 'KeyB',
    controlLabel: 'B = azul',
  },
  green: {
    label: 'VERDE',
    cssColor: '#16a34a',
    key: 'KeyG',
    controlLabel: 'G = verde',
  },
  yellow: {
    label: 'AMARILLO',
    cssColor: '#FFEA00',
    key: 'KeyY',
    controlLabel: 'Y = amarillo',
  },
}

export const STROOP_COLOR_KEYS = Object.keys(
  STROOP_COLORS,
) as StroopColorKey[]

export function getAvailableStroopColors(
  colorBlindMode?: ColorBlindMode,
): StroopColorKey[] {
  if (!colorBlindMode?.enabled || !colorBlindMode.excludedColor) {
    return STROOP_COLOR_KEYS
  }

  return STROOP_COLOR_KEYS.filter(
    (color) => color !== colorBlindMode.excludedColor,
  )
}

export function getDifferentStroopColor(
  color: StroopColorKey,
  availableColors: StroopColorKey[],
): StroopColorKey {
  const options = availableColors.filter((candidate) => candidate !== color)
  const index = Math.floor(Math.random() * options.length)

  return options[index]
}

export function keyToStroopColor(
  code: string,
  availableColors: StroopColorKey[],
): StroopColorKey | null {
  const color = availableColors.find(
    (candidate) => STROOP_COLORS[candidate].key === code,
  )

  return color ?? null
}
