// Central, validated read of the environment contract the E2E suite runs
// against. Keeping it in one module means every spec, the Playwright config, and
// the auth setup agree on the same variables — and a missing one fails loudly
// with a clear message instead of a confusing timeout deep in a test.
//
// The target is config-driven (the same contract e2e/smoke.sh uses), so the
// suite can be pointed at a dedicated staging/preview environment by changing
// these variables alone — no code change:
//
//   E2E_WEB_URL       base URL of the web app (Firebase Hosting)   → baseURL,
//                     and the API's same-origin base (${E2E_WEB_URL}/api)
//   E2E_LOGIN_SECRET  shared secret for the guarded test-login endpoint (M10.1)
//
// (E2E_API_URL — the raw Cloud Run URL — is used only by the bash /readyz smoke,
// e2e/smoke.sh; the TS suite reaches the API same-origin via the web app's /api.)
//
// No secret is embedded in the repo: E2E_LOGIN_SECRET is supplied at run time
// (CI secrets / Secret Manager), mirroring the value configured on the target
// service so POST /auth/test-login accepts the harness.

// required reads a mandatory env var, throwing a descriptive error when unset so
// the failure names the variable rather than surfacing as a generic timeout. It
// only trims surrounding whitespace — never the value's content — so a secret is
// returned byte-for-byte.
function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(
      `${name} is required for the E2E suite (set it from CI secrets / repo variables). ` +
        `See e2e/README.md for the environment contract.`,
    )
  }
  return value
}

// requiredURL reads a mandatory URL var and additionally trims a trailing slash
// so paths join cleanly (mirrors smoke.sh). This slash-trimming is URL-specific
// and must NOT be applied to the secret, whose value is compared verbatim by the
// backend (a base64 secret can legitimately end in '/').
function requiredURL(name: string): string {
  return required(name).replace(/\/+$/, '')
}

// webBaseURL is where the browser loads the app (Playwright's baseURL).
export const webBaseURL = requiredURL('E2E_WEB_URL')

// apiBaseURL is where the suite reaches the API — the web app's own `/api`
// origin, which Firebase Hosting rewrites to the Cloud Run service. Hitting the
// API same-origin (rather than the raw Cloud Run URL) is deliberate: it scopes
// the session cookie the harness mints to the web app, exactly as a real
// browser's is, so the stored session works both for direct API assertions here
// AND when loaded into a browser context. A cookie set on the raw Cloud Run host
// is a cross-site third-party cookie the browser would not send back to the web
// app (the very bug this suite must exercise, not paper over). E2E_API_URL is no
// longer read here (the bash smoke still uses it to probe /readyz directly).
export const apiBaseURL = `${webBaseURL}/api`

// e2eLoginSecret is the shared secret the harness presents to /auth/test-login.
// Read lazily (via a function) so specs that don't authenticate — e.g. the
// anonymous sign-in smoke — don't require it to be present. Returned verbatim so
// it matches the backend's constant-time check exactly.
export function e2eLoginSecret(): string {
  return required('E2E_LOGIN_SECRET')
}

// e2eLoginSecretHeader is the request header carrying e2eLoginSecret. Shared so
// auth.setup and the multi-identity helper (M10.2) present it identically.
export const e2eLoginSecretHeader = 'X-E2E-Login-Secret'

// storageStatePath is where the auth setup persists the signed-in session (the
// httpOnly session cookie) for the authenticated project to reuse. Kept out of
// git via e2e/.gitignore.
export const storageStatePath = 'playwright/.auth/user.json'
