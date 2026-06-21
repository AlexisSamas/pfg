export function parseBackendDateMs(value: string): number {
  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value)
  const normalizedValue = hasTimezone ? value : `${value}Z`

  return new Date(normalizedValue).getTime()
}

export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1_000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
