import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthContext'

// RequireAdmin gates routes that require is_admin=true. It wraps RequireAuth
// semantics: loading shows a placeholder, anonymous users go to /signin, and
// non-admin authenticated users are sent to the home page with a 403-like
// redirect. Server-side enforcement is authoritative; this is UX convenience
// only (PRD §5.9, M08.5 S1).
export function RequireAdmin() {
  const { status, user } = useAuth()

  if (status === 'loading') {
    return <p role="status">Loading…</p>
  }
  if (status === 'anonymous') {
    return <Navigate to="/signin" replace />
  }
  if (!user?.is_admin) {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}
