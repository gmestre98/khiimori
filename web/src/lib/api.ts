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

// HealthStatus is the API's /healthz response shape (a small JSON status body).
export interface HealthStatus {
  status: string
}

// fetchHealth calls GET /healthz through the configured base URL and returns the
// parsed status. It throws on a non-2xx response or any network/parse error, so
// the caller can render success vs failure off resolve/reject. An optional
// AbortSignal lets the caller cancel an in-flight check (e.g. on unmount).
export async function fetchHealth(signal?: AbortSignal): Promise<HealthStatus> {
  const res = await fetch(apiUrl('/healthz'), { signal })
  if (!res.ok) {
    throw new Error(`API returned HTTP ${res.status}`)
  }
  return (await res.json()) as HealthStatus
}
