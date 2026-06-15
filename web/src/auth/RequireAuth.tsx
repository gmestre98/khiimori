import { useEffect } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { setReturnTo, takeReturnTo } from './returnTo'

// RequireAuth gates the routes nested under it. It is a UX convenience only —
// the API still rejects unauthenticated calls with 401 (server-side enforcement
// is authoritative, PRD §6). While the session is still being checked it shows a
// placeholder (no flicker of protected content); an anonymous user is sent to
// the sign-in surface, remembering where they were headed so they can be
// returned there after signing in.
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return <p role="status">Loading…</p>
  }
  if (status === 'anonymous') {
    setReturnTo(location.pathname + location.search)
    return <Navigate to="/signin" replace />
  }
  return <Outlet />
}

// PostLoginRedirect returns a freshly-authenticated user to the destination they
// were trying to reach before signing in (stored across the OAuth round trip).
// It runs once when status becomes authenticated and is a no-op otherwise, so
// normal navigation is unaffected. Renders nothing.
export function PostLoginRedirect() {
  const { status } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (status !== 'authenticated') return
    const target = takeReturnTo()
    if (target && target !== window.location.pathname + window.location.search) {
      navigate(target, { replace: true })
    }
  }, [status, navigate])

  return null
}
