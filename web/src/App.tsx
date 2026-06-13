import './App.css'
import { HealthCheck } from './HealthCheck'

// Minimal app shell for Milestone 01. Real screens, navigation, and theming
// arrive in Milestone 09 — this is just the layout placeholder that proves the
// app builds and serves. The health-check view (S2) reports API connectivity.
function App() {
  return (
    <main className="app-shell">
      <h1>Khiimori</h1>
      <p className="tagline">Travel manager — app shell</p>
      <HealthCheck />
    </main>
  )
}

export default App
