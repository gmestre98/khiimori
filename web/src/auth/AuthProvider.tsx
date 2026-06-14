import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  fetchProfile,
  loginUrl,
  signOut as apiSignOut,
  UnauthorizedError,
  type Profile,
} from '../lib/api'
import { AuthContext, type AuthStatus } from './AuthContext'

// AuthProvider is the single source of auth state for the app. On mount it asks
// the backend whether there is a valid session (GET /me) and exposes the result
// plus the sign-in/out actions through AuthContext. State updates propagate to
// consumers, so the UI reacts to sign-in/out without a full reload.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<Profile | null>(null)

  // applyProfile / applyAnonymous fold a session-check result into state. The
  // server is authoritative — a 401 (or any failure to confirm) maps to
  // anonymous; unexpected errors are surfaced for debugging but still fail closed.
  const applyProfile = useCallback((profile: Profile) => {
    setUser(profile)
    setStatus('authenticated')
  }, [])
  const applyAnonymous = useCallback((err?: unknown) => {
    if (err && !(err instanceof UnauthorizedError)) {
      console.error('auth: session check failed', err)
    }
    setUser(null)
    setStatus('anonymous')
  }, [])

  // On mount, ask the backend whether there is a valid session. Inlined as a
  // promise chain (setState only in the deferred callbacks) and cancelled on
  // unmount via the abort signal.
  useEffect(() => {
    const controller = new AbortController()
    fetchProfile(controller.signal)
      .then((profile) => {
        if (!controller.signal.aborted) applyProfile(profile)
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) applyAnonymous(err)
      })
    return () => controller.abort()
  }, [applyProfile, applyAnonymous])

  const signIn = useCallback(() => {
    // Top-level navigation: the OAuth flow is a full-page redirect dance, after
    // which the callback redirects back and the app remounts authenticated.
    window.location.assign(loginUrl)
  }, [])

  const signOut = useCallback(async () => {
    await apiSignOut()
    applyAnonymous()
  }, [applyAnonymous])

  // refresh re-checks the session on demand (not in an effect, so a direct
  // await is fine). Used after actions that may change the session.
  const refresh = useCallback(async () => {
    try {
      applyProfile(await fetchProfile())
    } catch (err) {
      applyAnonymous(err)
    }
  }, [applyProfile, applyAnonymous])

  const setProfile = applyProfile

  return (
    <AuthContext.Provider value={{ status, user, signIn, signOut, refresh, setProfile }}>
      {children}
    </AuthContext.Provider>
  )
}
