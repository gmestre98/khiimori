import './App.css'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Home } from './pages/Home'
import { Profile } from './pages/Profile'
import { AdminPage, AdminHome } from './pages/AdminPage'
import { AdminUsersPage } from './pages/AdminUsersPage'
import { AdminTripsPage } from './pages/AdminTripsPage'
import { SignIn } from './auth/SignIn'
import { PostLoginRedirect, RequireAuth } from './auth/RequireAuth'
import { RequireAdmin } from './auth/RequireAdmin'
import { TripFormPage } from './trips/TripFormPage'
import { TripShellRoute } from './trips/TripShell'
import { DayView } from './trips/DayView'
import { BacklogPage } from './trips/BacklogPage'
import { TripBudgetPage } from './trips/TripBudgetPage'
import { TripSharingPage } from './trips/TripSharingPage'

// App is the milestone-02 shell and route table. Public route: /signin. Gated
// routes (everything under RequireAuth) require a valid session and redirect
// anonymous users to /signin. PostLoginRedirect returns a freshly-signed-in user
// to where they were headed. The profile screen is added under the gate in S5.
function App() {
  return (
    <>
      <PostLoginRedirect />
      <main className="app-shell">
        <h1>Khiimori</h1>
        <p className="tagline">Travel manager — app shell</p>

        <Routes>
          <Route path="/signin" element={<SignIn />} />
          <Route element={<RequireAuth />}>
            <Route path="/" element={<Home />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/trips/new" element={<TripFormPage />} />
            <Route path="/trips/:id/edit" element={<TripFormPage />} />
            <Route path="/trips/:tripId" element={<TripShellRoute />}>
              <Route path="days/:date" element={<DayView />} />
              <Route path="backlog" element={<BacklogPage />} />
              <Route path="budget" element={<TripBudgetPage />} />
              <Route path="sharing" element={<TripSharingPage />} />
            </Route>
          </Route>
          {/* Admin backoffice — gated by RequireAdmin (is_admin check, UX layer;
              server-side enforcement is authoritative per PRD §5.9). */}
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<AdminPage />}>
              <Route index element={<AdminHome />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route path="trips" element={<AdminTripsPage />} />
            </Route>
          </Route>
          {/* Unknown paths fall back to home, which gates to sign-in if anonymous. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  )
}

export default App
