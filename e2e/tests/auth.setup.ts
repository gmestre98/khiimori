import { test as setup, expect } from '@playwright/test'
import { apiBaseURL, e2eLoginSecret, storageStatePath } from '../env'

// Auth setup (M10.1): sign the fixed E2E test identity into the deployed target
// WITHOUT the interactive Google flow, then persist the session so every other
// spec starts authenticated.
//
// It calls the guarded backend endpoint POST /auth/test-login, presenting the
// shared E2E_LOGIN_SECRET (never committed — supplied at run time). The endpoint
// only exists on an environment where that secret is configured; it mints the
// same signed, httpOnly session cookie the real OAuth callback issues. We capture
// that cookie via the request context's storageState, which the authenticated
// Playwright project then loads into the browser — so the app's cross-origin
// fetches to the API carry the session (the cookie is SameSite=None; Secure in
// prod).
setup('authenticate the E2E test identity', async ({ request }) => {
  const res = await request.post(`${apiBaseURL}/auth/test-login`, {
    headers: { 'X-E2E-Login-Secret': e2eLoginSecret() },
  })

  // A clear failure here almost always means the secret is missing/mismatched or
  // the endpoint isn't enabled on the target — surface the status to say so.
  expect(
    res.ok(),
    `test-login failed (HTTP ${res.status()}). Check E2E_LOGIN_SECRET matches the ` +
      `E2E_LOGIN_SECRET configured on the target API.`,
  ).toBeTruthy()

  const body = (await res.json()) as { status?: string; user_id?: string }
  expect(body.status).toBe('signed_in')
  expect(body.user_id, 'test-login did not return a user id').toBeTruthy()

  // Persist the session cookie for the authenticated project to reuse.
  await request.storageState({ path: storageStatePath })
})
