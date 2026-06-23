// Centralised API access for the web app. The one job of this module is to be
// the single place that knows where the API lives, so the base URL is set once
// (from the environment) rather than scattered across feature code.

// Local development default, used when VITE_API_BASE_URL is unset (e.g. a plain
// `npm run dev` with no .env). It points at the API's default local port
// (backend PORT=8080). Production never relies on this: the real URL is injected
// at build time via VITE_API_BASE_URL (see .env.example and the CI deploy job),
// so there is no hardcoded production URL anywhere in the source (epic AC4).
const LOCAL_DEFAULT_BASE_URL = 'http://localhost:8080'

// apiBaseURL is the resolved API base URL — read once from the build-time env
// var, falling back to the local default. `||` (not `??`) so an empty/unset
// value both fall back: an empty VITE_API_BASE_URL would otherwise leave a blank
// base and turn API calls into same-origin (Hosting) paths. Trailing slashes
// are trimmed so apiUrl can join paths without producing a double slash.
export const apiBaseURL: string = (
  import.meta.env.VITE_API_BASE_URL?.trim() || LOCAL_DEFAULT_BASE_URL
).replace(/\/+$/, '')

// apiUrl joins an API path onto the configured base URL. Pass a leading-slash
// path (e.g. "/healthz"); a missing leading slash is tolerated.
export function apiUrl(path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${apiBaseURL}${suffix}`
}

// healthPath is the API endpoint the browser probes. It is /readyz, NOT
// /healthz: Cloud Run does not route external traffic to the liveness-probe
// path (/healthz returns 404 from the edge before reaching the app), so a
// browser can only reach /readyz — which also pings the DB, making a 200 a
// stronger "the API + its database are live" signal. The deployed e2e smoke
// (e2e/smoke.sh) probes /readyz for the same reason.
const healthPath = '/readyz'

// HealthStatus is the parsed shape of the readiness response we care about
// (e.g. {"status":"ready",...}); extra fields like per-check detail are ignored.
export interface HealthStatus {
  status: string
}

// fetchHealth calls GET /readyz through the configured base URL and returns the
// parsed status. It throws on a non-2xx response or any network/parse error, so
// the caller can render success vs failure off resolve/reject. An optional
// AbortSignal lets the caller cancel an in-flight check (e.g. on unmount).
export async function fetchHealth(signal?: AbortSignal): Promise<HealthStatus> {
  const res = await fetch(apiUrl(healthPath), { signal })
  if (!res.ok) {
    throw new Error(`API returned HTTP ${res.status}`)
  }
  return (await res.json()) as HealthStatus
}

// healthUrl is the full URL the health probe hits — exported so the UI can show
// exactly which endpoint it called.
export const healthUrl = apiUrl(healthPath)

// --- Authenticated API access (M02.5) ---------------------------------------

// loginUrl starts the Google sign-in flow (Epic 01). Sign-in is a top-level
// browser navigation (the OAuth redirect dance), so the UI navigates the whole
// page here rather than fetching it.
export const loginUrl = apiUrl('/auth/login')

// UnauthorizedError marks a 401 from the API so callers can treat "not signed
// in" distinctly from network/other errors (the auth context maps it to the
// anonymous state; the central handler, S4, drives re-auth).
export class UnauthorizedError extends Error {
  constructor() {
    super('unauthorized')
    this.name = 'UnauthorizedError'
  }
}

// onUnauthorized is the single app-wide reaction to an expired/absent session.
let onUnauthorized: (() => void) | null = null

// setUnauthorizedHandler registers the one callback invoked whenever any
// authenticated API call returns 401 — i.e. the session expired or is missing.
// The auth provider registers a handler that flips the app to anonymous; the
// route gating (S3) then sends the user to sign-in, preserving their place via
// returnTo. Centralising it here means every call benefits without per-call 401
// checks. Pass null to clear (on unmount).
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn
}

// apiFetch is the single choke point for authenticated API calls. It always
// sends credentials so the httpOnly session cookie travels cross-origin to the
// API (and Set-Cookie is honoured), and it routes every 401 through the central
// unauthorized handler so an expired session triggers re-auth app-wide. The
// response is still returned so callers can handle it (e.g. fetchProfile throws
// UnauthorizedError); non-401 responses are untouched.
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(apiUrl(path), { ...init, credentials: 'include' })
  if (res.status === 401) {
    onUnauthorized?.()
  }
  return res
}

// Profile is the wire shape of GET /me (Epic 04). default_currency is read-only
// (always EUR in v1); the rest are editable via updateProfile (S5).
export interface Profile {
  name: string
  email: string
  avatar: string
  home_base: string
  theme: string
  default_currency: string
}

// fetchProfile loads the signed-in user's profile (GET /me). It throws
// UnauthorizedError on 401 (no/expired session) and a generic Error otherwise.
export async function fetchProfile(signal?: AbortSignal): Promise<Profile> {
  const res = await apiFetch('/me', { signal })
  if (res.status === 401) {
    throw new UnauthorizedError()
  }
  if (!res.ok) {
    throw new Error(`API returned HTTP ${res.status}`)
  }
  return (await res.json()) as Profile
}

// ProfilePatch is the editable subset of the profile (PATCH /me). Omitted fields
// are left unchanged; default_currency is intentionally absent — it is read-only
// (always EUR) and the API ignores any attempt to change it.
export interface ProfilePatch {
  name?: string
  avatar?: string
  home_base?: string
  theme?: string
}

// ProfileValidationError carries the API's 400 message (e.g. an invalid theme or
// an over-long field) so the profile screen can show it to the user.
export class ProfileValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProfileValidationError'
  }
}

// updateProfile saves the editable profile fields (PATCH /me) and returns the
// updated profile. A 401 throws UnauthorizedError (the central handler drives
// re-auth); a 400 throws ProfileValidationError with the API's message.
export async function updateProfile(patch: ProfilePatch): Promise<Profile> {
  const res = await apiFetch('/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (res.status === 401) {
    throw new UnauthorizedError()
  }
  if (res.status === 400) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new ProfileValidationError(body?.error?.message ?? 'Invalid profile')
  }
  if (!res.ok) {
    throw new Error(`API returned HTTP ${res.status}`)
  }
  return (await res.json()) as Profile
}

// --- Trips (M03.5 S1) -------------------------------------------------------

// Trip is the wire shape of a single trip returned by GET /trips.
export interface Trip {
  id: string
  owner_id: string
  name: string
  destinations: string[]
  start_date: string
  end_date: string
  base_currency: string
  cover: string
  status: string
  created_at: string
  updated_at: string
  is_current: boolean
}

// TripsResponse is the bucketed shape of GET /trips — trips grouped by the
// server into Current / Upcoming / Past (archived trips are excluded).
export interface TripsResponse {
  current: Trip[]
  upcoming: Trip[]
  past: Trip[]
}

// fetchTrips loads the signed-in user's trips from GET /trips. It throws
// UnauthorizedError on 401 and a generic Error on other failures.
// Set VITE_USE_MOCK_TRIPS=true in .env.local to return local mock data instead.
export async function fetchTrips(signal?: AbortSignal): Promise<TripsResponse> {
  if (import.meta.env.VITE_USE_MOCK_TRIPS === 'true') {
    const { mockTripsResponse } = await import('./mock-trips')
    return mockTripsResponse
  }
  const res = await apiFetch('/trips', { signal })
  if (res.status === 401) {
    throw new UnauthorizedError()
  }
  if (!res.ok) {
    throw new Error(`API returned HTTP ${res.status}`)
  }
  return (await res.json()) as TripsResponse
}

// TripInput is the editable fields sent to POST /trips or PATCH /trips/:id.
export interface TripInput {
  name: string
  destinations: string[]
  start_date: string
  end_date: string
  cover: string
}

// TripValidationError carries the API's 400 message so the form can surface it.
export class TripValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TripValidationError'
  }
}

// TripShrinkConflictError is returned when a PATCH would remove days that hold
// data (409 days_have_data). count is how many days would be removed. Retry with
// forceShrink: true after user confirmation to proceed.
export class TripShrinkConflictError extends Error {
  constructor(public count: number) {
    super(`${count} day(s) hold data`)
    this.name = 'TripShrinkConflictError'
  }
}

// createTrip calls POST /trips and returns the new trip. Throws TripValidationError
// on 400 and UnauthorizedError on 401.
export async function createTrip(input: TripInput): Promise<Trip> {
  const res = await apiFetch('/trips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (res.status === 400) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new TripValidationError(body?.error?.message ?? 'Invalid trip')
  }
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
  return (await res.json()) as Trip
}

// updateTrip calls PATCH /trips/:id. Set forceShrink to true after user
// confirmation when TripShrinkConflictError is thrown.
export async function updateTrip(
  id: string,
  input: TripInput,
  forceShrink = false,
): Promise<Trip> {
  const res = await apiFetch(`/trips/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, force_shrink: forceShrink }),
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (res.status === 400) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new TripValidationError(body?.error?.message ?? 'Invalid trip')
  }
  if (res.status === 409) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    const msg = body?.error?.message ?? ''
    const match = /^(\d+) day/.exec(msg)
    throw new TripShrinkConflictError(match ? parseInt(match[1], 10) : 1)
  }
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
  return (await res.json()) as Trip
}

// signOut ends the session server-side (clears the cookie, Epic 03). It resolves
// regardless of the response so the UI can always drop local auth state.
export async function signOut(): Promise<void> {
  try {
    await apiFetch('/auth/logout', { method: 'POST' })
  } catch {
    // Network failure on logout still clears client state — best effort.
  }
}
