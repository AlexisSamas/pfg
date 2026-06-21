import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FlowProgress } from './FlowProgress'

describe('FlowProgress', () => {
  it('muestra los pasos principales del flujo', () => {
    render(<FlowProgress currentStep="cpt" />)

    expect(screen.getByText('Login')).toBeInTheDocument()
    expect(screen.getByText('Sesión')).toBeInTheDocument()
    expect(screen.getByText('CPT')).toBeInTheDocument()
    expect(screen.getByText('Stroop')).toBeInTheDocument()
    expect(screen.getByText('Flanker')).toBeInTheDocument()
    expect(screen.getByText('Resultado')).toBeInTheDocument()
  })
})
