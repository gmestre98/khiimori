import './App.css'
import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from './design/ThemeProvider'
import { SignIn } from './auth/SignIn'
import { PostLoginRedirect, RequireAuth } from './auth/RequireAuth'
import { RequireAdmin } from './auth/RequireAdmin'
import { AuthenticatedLayout } from './components/layout/AuthenticatedLayout'
import { InstallPrompt } from './components/InstallPrompt'

// Route-level code-splitting (M09.5 S2): each lazy() call produces a separate
// JS chunk so the browser only fetches what's needed for the current route.
// Named exports are re-wrapped as { default } so React.lazy is satisfied.
// The critical path (sign-in + layout chrome) is NOT lazy — it must render
// immediately. Heavy feature screens are deferred.
const Home = lazy(() => import('./pages/Home').then((m) => ({ default: m.Home })))
const Profile = lazy(() => import('./pages/Profile').then((m) => ({ default: m.Profile })))
const TripFormPage = lazy(() =>
  import('./trips/TripFormPage').then((m) => ({ default: m.TripFormPage })),
)
const TripShellRoute = lazy(() =>
  import('./trips/TripShell').then((m) => ({ default: m.TripShellRoute })),
)
const DayView = lazy(() => import('./trips/DayView').then((m) => ({ default: m.DayView })))
const BacklogPage = lazy(() =>
  import('./trips/BacklogPage').then((m) => ({ default: m.BacklogPage })),
)
const TripBudgetPage = lazy(() =>
  import('./trips/TripBudgetPage').then((m) => ({ default: m.TripBudgetPage })),
)
const TripPlanPage = lazy(() =>
  import('./trips/TripPlanPage').then((m) => ({ default: m.TripPlanPage })),
)
const TripMapPage = lazy(() =>
  import('./trips/TripMapPage').then((m) => ({ default: m.TripMapPage })),
)
const TripSharingPage = lazy(() =>
  import('./trips/TripSharingPage').then((m) => ({ default: m.TripSharingPage })),
)
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })))
const AdminHome = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminHome })))
const AdminUsersPage = lazy(() =>
  import('./pages/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage })),
)
const AdminTripsPage = lazy(() =>
  import('./pages/AdminTripsPage').then((m) => ({ default: m.AdminTripsPage })),
)

// RouteLoading is the Suspense fallback shown while a lazy route chunk loads.
// Kept intentionally minimal — it renders inside the already-mounted layout
// chrome so the visual shift is small.
function RouteLoading() {
  return (
    <p className="route-loading" aria-busy="true">
      Loading…
    </p>
  )
}

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
              <Route
                path="/"
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <Home />
                  </Suspense>
                }
              />
              <Route
                path="/profile"
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <Profile />
                  </Suspense>
                }
              />
              <Route
                path="/trips/new"
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <TripFormPage />
                  </Suspense>
                }
              />
              <Route
                path="/trips/:id/edit"
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <TripFormPage />
                  </Suspense>
                }
              />
              <Route
                path="/trips/:tripId"
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <TripShellRoute />
                  </Suspense>
                }
              >
                <Route
                  path="days/:date"
                  element={
                    <Suspense fallback={<RouteLoading />}>
                      <DayView />
                    </Suspense>
                  }
                />
                <Route
                  path="backlog"
                  element={
                    <Suspense fallback={<RouteLoading />}>
                      <BacklogPage />
                    </Suspense>
                  }
                />
                <Route
                  path="plan"
                  element={
                    <Suspense fallback={<RouteLoading />}>
                      <TripPlanPage />
                    </Suspense>
                  }
                />
                <Route
                  path="map"
                  element={
                    <Suspense fallback={<RouteLoading />}>
                      <TripMapPage />
                    </Suspense>
                  }
                />
                {/* Journal folded into the merged Day tab (/plan). Keep the old
                    path as a redirect so bookmarks and in-app links still land. */}
                <Route path="journal" element={<Navigate to="../plan" replace />} />
                <Route
                  path="budget"
                  element={
                    <Suspense fallback={<RouteLoading />}>
                      <TripBudgetPage />
                    </Suspense>
                  }
                />
                <Route
                  path="sharing"
                  element={
                    <Suspense fallback={<RouteLoading />}>
                      <TripSharingPage />
                    </Suspense>
                  }
                />
              </Route>
            </Route>
          </Route>
          {/* Admin backoffice — gated by RequireAdmin (is_admin check, UX layer;
              server-side enforcement is authoritative per PRD §5.9). */}
          <Route element={<RequireAdmin />}>
            <Route
              path="/admin"
              element={
                <Suspense fallback={<RouteLoading />}>
                  <AdminPage />
                </Suspense>
              }
            >
              <Route
                index
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <AdminHome />
                  </Suspense>
                }
              />
              <Route
                path="users"
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <AdminUsersPage />
                  </Suspense>
                }
              />
              <Route
                path="trips"
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <AdminTripsPage />
                  </Suspense>
                }
              />
            </Route>
          </Route>
          {/* Unknown paths fall back to home, which gates to sign-in if anonymous. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        {/* App-wide "add to home screen" offer. Self-hides unless the platform
            supports installing and the app isn't already installed. */}
        <InstallPrompt />
      </div>
    </ThemeProvider>
  )
}

export default App
