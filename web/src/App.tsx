import './App.css'
import { HealthCheck } from './HealthCheck'
import { useAuth } from './auth/AuthContext'
import { SignIn } from './auth/SignIn'

// App is the milestone-02 shell. It reflects auth state from the context: a
// loading placeholder while the session is checked, the sign-in surface when
// anonymous, and the signed-in shell (with sign-out) when authenticated. Full
// routing + route gating arrive in S3; the profile screen in S5.
function App() {
  const { status, user, signOut } = useAuth()

  return (
    <main className="app-shell">
      <h1>Khiimori</h1>
      <p className="tagline">Travel manager — app shell</p>

      {status === 'loading' && <p role="status">Loading…</p>}

      {status === 'anonymous' && <SignIn />}

      {status === 'authenticated' && (
        <section className="signed-in">
          <p>
            Signed in as <strong>{user?.name || user?.email}</strong>
          </p>
          <button type="button" className="btn-secondary" onClick={() => void signOut()}>
            Sign out
          </button>
          <HealthCheck />
        </section>
      )}
    </main>
  )
}

export default App
