import { useAuth } from '../auth/AuthContext'
import { TripsDashboard } from '../trips/TripsDashboard'

// Home is the authenticated landing screen. It renders the signed-in greeting
// and the Trips dashboard (Current / Upcoming / Past) from M03.5 S1. Primary
// navigation (Profile, sign out) now lives in the app navigation chrome
// (AuthenticatedLayout, M09.3 S2) rather than a per-screen nav.
export function Home() {
  const { user } = useAuth()

  return (
    <section className="signed-in">
      <p>
        Signed in as <strong>{user?.name || user?.email}</strong>
      </p>
      <TripsDashboard />
    </section>
  )
}
