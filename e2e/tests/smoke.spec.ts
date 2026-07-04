import { test, expect } from '@playwright/test'

// Smoke tests (M10.1 S1): prove the harness genuinely drives the deployed app —
// both that the anonymous shell loads and reaches sign-in, and that the
// test-auth path (auth.setup.ts → storageState) actually signs the user in. This
// is the backbone the critical-journey test (S2) builds on.

test.describe('anonymous', () => {
  // This block runs WITHOUT the shared session: an anonymous visitor should be
  // routed to the sign-in screen. Overriding storageState here (the project
  // default is the authenticated state) isolates the unauthenticated path.
  test.use({ storageState: { cookies: [], origins: [] } })

  test('app shell loads and an anonymous visitor reaches sign-in', async ({ page }) => {
    await page.goto('/')

    // The gated routes redirect an anonymous user to /signin, where the single
    // Google sign-in control is the stable, accessible landmark to assert on.
    await expect(page.getByRole('button', { name: /sign in with google/i })).toBeVisible()
  })
})

test('authenticated smoke — test-auth reaches the app', async ({ page }) => {
  // Uses the project's default storageState (the session minted by auth.setup),
  // so this proves the test-login harness works end to end.
  await page.goto('/')

  // Signed in, we are NOT bounced to sign-in: the Google control is gone and the
  // authenticated navigation chrome rendered. Which nav landmark exists is
  // viewport-dependent (the "Primary" sidebar on laptop, the "Main navigation"
  // bottom bar on mobile — each rendered conditionally, not just CSS-hidden), so
  // assert that *some* navigation landmark is present rather than a specific one.
  await expect(page.getByRole('button', { name: /sign in with google/i })).toHaveCount(0)
  await expect(page.getByRole('navigation').first()).toBeVisible()
})
