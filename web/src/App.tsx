import './App.css'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from './design/ThemeProvider'
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
import { AuthenticatedLayout } from './components/layout/AuthenticatedLayout'

// App is the shell and route table. Public route: /signin (rendered bare). Gated
// routes (everything under RequireAuth) require a valid session and redirect
// anonymous users to /signin; they render inside AuthenticatedLayout, which
// supplies the responsive navigation chrome (laptop sidebar / mobile bottom nav
// + thumb-zone action, M09.3). PostLoginRedirect returns a freshly-signed-in
// user to where they were headed.
function App() {
  return (
    <ThemeProvider>
      <PostLoginRedirect />
      <div className="app-root">
        <Routes>
          <Route path="/signin" element={<SignIn />} />
          <Route element={<RequireAuth />}>
            <Route element={<AuthenticatedLayout />}>
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
      </div>
    </ThemeProvider>
  )
}

export default App
