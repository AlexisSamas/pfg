import { describe, expect, it } from 'vitest'
import { getAvailableStroopColors } from './stroopColors'

describe('getAvailableStroopColors', () => {
  it('devuelve todos los colores si el modo daltónico está desactivado', () => {
    expect(getAvailableStroopColors()).toEqual([
      'red',
      'blue',
      'green',
      'yellow',
    ])
  })

  it('excluye rojo cuando excludedColor es red', () => {
    expect(
      getAvailableStroopColors({ enabled: true, excludedColor: 'red' }),
    ).toEqual(['blue', 'green', 'yellow'])
  })

  it('excluye verde cuando excludedColor es green', () => {
    expect(
      getAvailableStroopColors({ enabled: true, excludedColor: 'green' }),
    ).toEqual(['red', 'blue', 'yellow'])
  })

  it('excluye azul cuando excludedColor es blue', () => {
    expect(
      getAvailableStroopColors({ enabled: true, excludedColor: 'blue' }),
    ).toEqual(['red', 'green', 'yellow'])
  })
})
