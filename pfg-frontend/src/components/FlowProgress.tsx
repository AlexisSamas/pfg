const FLOW_STEPS = [
  { id: 'login', label: 'Login' },
  { id: 'session', label: 'Sesión' },
  { id: 'cpt', label: 'CPT' },
  { id: 'stroop', label: 'Stroop' },
  { id: 'flanker', label: 'Flanker' },
  { id: 'result', label: 'Resultado' },
] as const

export type FlowStep = (typeof FLOW_STEPS)[number]['id']

type FlowProgressProps = {
  currentStep: FlowStep
  className?: string
}

export function FlowProgress({ className, currentStep }: FlowProgressProps) {
  const currentIndex = FLOW_STEPS.findIndex((step) => step.id === currentStep)
  const progressClassName = ['flow-progress', className]
    .filter(Boolean)
    .join(' ')

  return (
    <ol className={progressClassName} aria-label="Progreso del flujo">
      {FLOW_STEPS.map((step, index) => {
        const status =
          index < currentIndex
            ? 'completed'
            : index === currentIndex
              ? 'current'
              : 'pending'

        return (
          <li
            aria-current={status === 'current' ? 'step' : undefined}
            className={`flow-progress__item flow-progress__item--${status}`}
            key={step.id}
          >
            <span className="flow-progress__marker">{index + 1}</span>
            <span>{step.label}</span>
          </li>
        )
      })}
    </ol>
  )
}
