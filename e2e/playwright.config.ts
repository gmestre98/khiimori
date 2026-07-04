import { defineConfig, devices } from '@playwright/test'
import { webBaseURL, storageStatePath } from './env'

// Playwright configuration for the Milestone 10 end-to-end suite. It drives the
// DEPLOYED web/PWA (baseURL = E2E_WEB_URL) rather than a local build — the whole
// point is to prove the real staging/preview environment works end to end, so
// there is deliberately no webServer block here.
//
// The suite is structured for CI (S3): a single Chromium browser keeps the run
// lean against the free GitHub Actions minutes (a named cost, PRD §8.4 #4), and
// an auth "setup" project signs a test identity in once (via the guarded
// test-login endpoint) and shares the resulting session with the real specs
// through storageState — so the journey specs never repeat sign-in.
export default defineConfig({
  testDir: './tests',
  // Fail the CI run if a `test.only` is accidentally committed.
  forbidOnly: !!process.env.CI,
  // The target is a scale-to-zero deploy: a cold start + Neon wake can make the
  // first hit slow, so retry once in CI to absorb transient cold-start flakes
  // without masking real failures.
  retries: process.env.CI ? 1 : 0,
  // Serial is fine for a lean smoke/journey suite and keeps behaviour
  // deterministic against a single shared test identity (S2 relies on stable,
  // ordered data). Revisit if the suite grows.
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: webBaseURL,
    // Only keep traces/screenshots for a failing test — cheap to store, and the
    // artefact is there when a staging failure needs diagnosing.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Signs the fixed test identity into the target and writes the session to
    // storageState. Runs first; the authenticated project depends on it.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Reuse the session minted by the setup project (the httpOnly session
        // cookie), so specs start already signed in.
        storageState: storageStatePath,
      },
      dependencies: ['setup'],
    },
  ],
})
