import { describe, expect, it } from 'vitest'
import { getRecommendationMessage } from './recommendationMessages'

describe('getRecommendationMessage', () => {
  it('convierte recommendation_key en mensajes humanos', () => {
    expect(getRecommendationMessage('low_dprime')).toMatch(
      /atención sostenida/i,
    )
    expect(getRecommendationMessage('high_stroop_effect')).toMatch(
      /respuestas automáticas/i,
    )
    expect(getRecommendationMessage('low_flanker_accuracy')).toMatch(
      /flanker/i,
    )
  })

  it('devuelve un mensaje por defecto para claves desconocidas', () => {
    expect(getRecommendationMessage('unknown_key')).toMatch(/pausa breve/i)
  })
})
