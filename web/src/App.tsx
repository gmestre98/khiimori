import './App.css'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Home } from './pages/Home'
import { Profile } from './pages/Profile'
import { SignIn } from './auth/SignIn'
import { PostLoginRedirect, RequireAuth } from './auth/RequireAuth'
import { TripFormPage } from './trips/TripFormPage'
import { TripShell } from './trips/TripShell'
import { DayView } from './trips/DayView'

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
            <Route path="/trips/:tripId" element={<TripShell />}>
              <Route path="days/:date" element={<DayView />} />
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
