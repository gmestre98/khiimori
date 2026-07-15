import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  fetchProfile,
  loginUrl,
  setUnauthorizedHandler,
  signOut as apiSignOut,
  UnauthorizedError,
  type Profile,
} from '../lib/api'
import { cacheKeys } from '../lib/cacheKeys'
import { clearCache, readCache, writeCache } from '../lib/resourceCache'
import { AuthContext, type AuthStatus } from './AuthContext'

// profileKey is where the last-known signed-in profile lives in the on-device
// read cache, so the app can confirm "who is signed in" offline (see the mount
// effect below) the same way screens read their data from the cache offline.
const profileKey = cacheKeys.profile()

// AuthProvider is the single source of auth state for the app. On mount it asks
// the backend whether there is a valid session (GET /me) and exposes the result
// plus the sign-in/out actions through AuthContext. State updates propagate to
// consumers, so the UI reacts to sign-in/out without a full reload.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<Profile | null>(null)

  // applyProfile / applyAnonymous fold a session-check result into state. A
  // server 401 is authoritative and maps to anonymous; a network failure does
  // not (see the mount effect — it falls back to the cached profile so the app
  // works offline). Unexpected errors are surfaced for debugging.
  const applyProfile = useCallback((profile: Profile, persist = true) => {
    setUser(profile)
    setStatus('authenticated')
    // Persist the confirmed profile so a later offline start can stay signed in
    // (see the mount effect). Skipped when we just loaded it *from* the cache.
    if (persist) void writeCache(profileKey, profile)
  }, [])
  const applyAnonymous = useCallback((err?: unknown) => {
    if (err && !(err instanceof UnauthorizedError)) {
      console.error('auth: session check failed', err)
    }
    setUser(null)
    setStatus('anonymous')
  }, [])

  // Centralised 401 handling (S4): any authenticated API call that comes back
  // 401 (expired/absent session) flips the app to anonymous; the route gating
  // then redirects to sign-in, preserving the user's place via returnTo. One
  // handler for the whole app — no per-call 401 checks.
  useEffect(() => {
    setUnauthorizedHandler(() => applyAnonymous())
    return () => setUnauthorizedHandler(null)
  }, [applyAnonymous])

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
        if (controller.signal.aborted) return
        // A genuine 401 means the session is gone — fail closed to anonymous.
        if (err instanceof UnauthorizedError) {
          applyAnonymous(err)
          return
        }
        // Otherwise the backend was simply unreachable (offline / network
        // error). Don't force a re-login the user can't complete without a
        // connection: if we have a profile cached from a previous session, stay
        // authenticated so the app's offline-capable screens (which read the
        // same on-device cache) keep working. Only fall back to anonymous when
        // there is nothing cached to trust.
        void readCache<Profile>(profileKey).then((cached) => {
          if (controller.signal.aborted) return
          if (cached) applyProfile(cached.data, false)
          else applyAnonymous(err)
        })
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
    // Wipe the on-device cache (incl. the cached profile) so a signed-out user
    // can't be re-authenticated from it offline, and one user's data never
    // bleeds into the next session on a shared device.
    await clearCache()
    applyAnonymous()
  }, [applyAnonymous])

  // refresh re-checks the session on demand (not in an effect, so a direct
  // await is fine). Used after actions that may change the session.
  const refresh = useCallback(async () => {
    try {
      applyProfile(await fetchProfile())
    } catch (err) {
      // Only a real 401 signs the user out. A network error (offline) must not
      // drop an already-authenticated session — keep the current state.
      if (err instanceof UnauthorizedError) applyAnonymous(err)
    }
  }, [applyProfile, applyAnonymous])

  const setProfile = applyProfile

  return (
    <AuthContext.Provider value={{ status, user, signIn, signOut, refresh, setProfile }}>
      {children}
    </AuthContext.Provider>
  )
}
