import { HealthCheck } from '../HealthCheck'
import { useAuth } from '../auth/AuthContext'

// Home is the authenticated landing (gated by RequireAuth). For Milestone 02 it
// is just the signed-in shell — a greeting, sign-out, and the API health probe.
// Real feature screens arrive in Milestones 03+.
export function Home() {
  const { user, signOut } = useAuth()

  return (
    <section className="signed-in">
      <p>
        Signed in as <strong>{user?.name || user?.email}</strong>
      </p>
      <button type="button" className="btn-secondary" onClick={() => void signOut()}>
        Sign out
      </button>
      <HealthCheck />
    </section>
  )
}
