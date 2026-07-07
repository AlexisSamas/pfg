import './GameInstructions.css'

type GameInstructionsProps = {
  title: string
  description: string
  controls: string[]
  compact?: boolean
  onStart: () => void
}

export function GameInstructions({
  title,
  description,
  controls,
  compact = false,
  onStart,
}: GameInstructionsProps) {
  const className = compact
    ? 'game-instructions game-instructions--compact'
    : 'game-instructions'

  return (
    <section className={className} aria-labelledby="game-title">
      <div>
        <p className="eyebrow">Instrucciones</p>
        <h1 id="game-title">{title}</h1>
        <p className="description">{description}</p>
      </div>

      <div className="controls-panel">
        <h2>Controles</h2>
        <ul>
          {controls.map((control) => (
            <li key={control}>{control}</li>
          ))}
        </ul>
      </div>

      <button type="button" className="primary-action" onClick={onStart}>
        Comenzar práctica
      </button>
    </section>
  )
}
