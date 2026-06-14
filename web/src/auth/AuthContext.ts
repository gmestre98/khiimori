import { createContext, useContext } from 'react'
import type { Profile } from '../lib/api'

// AuthStatus is the lifecycle of the app's knowledge of the session:
//   loading        — still checking the backend (initial /me call in flight)
//   authenticated  — a valid session; `user` is populated
//   anonymous      — no/expired session
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

// AuthContextValue is the single surface the app uses to ask "who is the user /
// am I signed in" and to start/end a session. It is authentication state only —
// authorization (what the user may touch) is not decided here (PRD §5.9).
export interface AuthContextValue {
  status: AuthStatus
  user: Profile | null
  // signIn navigates the browser to the Google sign-in flow.
  signIn: () => void
  // signOut ends the session and drops local auth state.
  signOut: () => Promise<void>
  // refresh re-checks the session against the backend (e.g. after an edit, or
  // when the app wants to re-confirm). Updates status/user.
  refresh: () => Promise<void>
  // setProfile replaces the cached user after a local change (e.g. a profile
  // edit, S5) so consumers reflect it without a round-trip.
  setProfile: (user: Profile) => void
}

// AuthContext is created with no default so a missing provider is a clear error
// (caught by useAuth) rather than a silent wrong-state.
export const AuthContext = createContext<AuthContextValue | null>(null)

// useAuth reads the auth context. It throws if used outside <AuthProvider>, so
// the wiring mistake surfaces immediately in development.
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (ctx === null) {
    throw new Error('useAuth must be used within an <AuthProvider>')
  }
  return ctx
}
