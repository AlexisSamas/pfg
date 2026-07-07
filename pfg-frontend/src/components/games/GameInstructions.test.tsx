import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GameInstructions } from './GameInstructions'

describe('GameInstructions', () => {
  it('renderiza título, descripción, controles y botón', () => {
    render(
      <GameInstructions
        title="CPT: atención sostenida"
        description="Pulsa la barra espaciadora cuando aparezca la X."
        controls={[
          'Barra espaciadora: responder.',
          'No pulses si aparece otra letra.',
        ]}
        onStart={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('heading', { name: /cpt: atención sostenida/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/pulsa la barra espaciadora/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/barra espaciadora: responder/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/no pulses si aparece otra letra/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /comenzar práctica/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^comenzar$/i }),
    ).not.toBeInTheDocument()
  })
})
