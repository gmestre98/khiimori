import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

// AdminPage is the shell for the admin backoffice (M08.5). It renders the
// top-level admin navigation and an <Outlet> for nested admin sub-routes
// (users, trips). Visible only to is_admin users (gated by RequireAdmin in
// App.tsx; server-side enforcement is authoritative).
export function AdminPage() {
  const { user } = useAuth()
  const location = useLocation()

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <h2>Admin Backoffice</h2>
        <p className="admin-subtitle">Signed in as {user?.email}</p>
        <nav className="admin-nav">
          <Link to="/admin/users" className={location.pathname === '/admin/users' ? 'active' : ''}>
            Users
          </Link>
          <Link to="/admin/trips" className={location.pathname === '/admin/trips' ? 'active' : ''}>
            Trips
          </Link>
          <Link to="/">← Back to app</Link>
        </nav>
      </header>
      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  )
}

// AdminHome is the default landing inside /admin — redirects to users list.
export function AdminHome() {
  return (
    <div>
      <p>Select a section from the navigation above.</p>
    </div>
  )
}
