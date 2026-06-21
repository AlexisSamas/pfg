export const DEFAULT_GAME_DURATION_MS = 60_000

export function getGameDurationMs(): number {
  const configuredDuration = Number(import.meta.env.VITE_GAME_DURATION_MS)

  if (Number.isFinite(configuredDuration) && configuredDuration > 0) {
    return configuredDuration
  }

  return DEFAULT_GAME_DURATION_MS
}
