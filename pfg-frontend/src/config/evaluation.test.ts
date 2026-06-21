import { describe, expect, it } from 'vitest'
import { DEFAULT_GAME_DURATION_MS } from './evaluation'

describe('evaluation config', () => {
  it('usa 60 segundos como duración final por defecto', () => {
    expect(DEFAULT_GAME_DURATION_MS).toBe(60_000)
  })
})
