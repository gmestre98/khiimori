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

// apiFetch is the single choke point for authenticated API calls. It always
// sends credentials so the httpOnly session cookie travels cross-origin to the
// API (and Set-Cookie is honoured). Centralising it here is what lets S4 add
// one 401 interceptor for the whole app.
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), { ...init, credentials: 'include' })
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

// signOut ends the session server-side (clears the cookie, Epic 03). It resolves
// regardless of the response so the UI can always drop local auth state.
export async function signOut(): Promise<void> {
  try {
    await apiFetch('/auth/logout', { method: 'POST' })
  } catch {
    // Network failure on logout still clears client state — best effort.
  }
}
