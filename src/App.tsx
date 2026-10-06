import { LADDERS } from './data/ladders'
import { UNITS } from './data/types'

// Placeholder home screen; the Stage 1 wizard replaces this.
function App() {
  return (
    <main>
      <h1>Gel Reader</h1>
      <p className="muted">Estimate band sizes from gel photos. Stage 1 in progress.</p>
      <h2>Ladder library ({LADDERS.length})</h2>
      <ul>
        {LADDERS.map((l) => (
          <li key={l.id}>
            {l.manufacturer} {l.name} — {l.bands.length} bands ({UNITS[l.gelType]})
          </li>
        ))}
      </ul>
    </main>
  )
}

export default App
