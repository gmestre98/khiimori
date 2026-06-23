import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { TripsDashboard } from '../trips/TripsDashboard'

// Home is the authenticated landing screen. It renders the signed-in header
// and the Trips dashboard (Current / Upcoming / Past) from M03.5 S1.
export function Home() {
  const { user, signOut } = useAuth()

  return (
    <section className="signed-in">
      <p>
        Signed in as <strong>{user?.name || user?.email}</strong>
      </p>
      <nav className="home-nav">
        <Link to="/profile">Profile</Link>
        <button type="button" className="btn-secondary" onClick={() => void signOut()}>
          Sign out
        </button>
      </nav>
      <TripsDashboard />
    </section>
  )
}
