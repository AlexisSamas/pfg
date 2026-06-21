import './GameInstructions.css'

type GameInstructionsProps = {
  title: string
  description: string
  controls: string[]
  onStart: () => void
}

export function GameInstructions({
  title,
  description,
  controls,
  onStart,
}: GameInstructionsProps) {
  return (
    <section className="game-instructions" aria-labelledby="game-title">
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
        Comenzar
      </button>
    </section>
  )
}
