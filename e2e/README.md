# e2e

End-to-end tests that run against the **deployed** environment (a preview/staging
target, or the single v1 env today), after the deploy stages. Milestone 10 builds
the real suite here on top of the M01.5 smoke stage.

## The harness (Playwright — M10.1 S1)

A **TypeScript Playwright** runner drives the deployed web/PWA against a
config-driven target. It is structured for CI (S3) and shared by the
critical-journey test (S2) and the later role/offline E2E (Epic 02).

- [`playwright.config.ts`](playwright.config.ts) — drives the **deployed** app
  (`baseURL = E2E_WEB_URL`); no local `webServer`. One Chromium project to keep
  CI minutes lean (PRD §8.4 #4), plus an auth **setup** project.
- [`env.ts`](env.ts) — the single, validated read of the environment contract.
- [`tests/auth.setup.ts`](tests/auth.setup.ts) — signs the fixed test identity in
  and persists the session (see **Test auth** below).
- [`tests/smoke.spec.ts`](tests/smoke.spec.ts) — smoke coverage: the anonymous
  shell reaches sign-in, and the test-auth path reaches the app.
- [`tests/critical-journey.spec.ts`](tests/critical-journey.spec.ts) — the
  headline journey (M10.1 S2): create trip → plan a day → add a budget → write a
  journal → share the trip, asserting a persisted outcome at each step and
  deleting the trip (cascade) afterwards so reruns stay clean.
- [`tests/role-access.spec.ts`](tests/role-access.spec.ts) — role-based access
  (M10.2 S1): an owner + invited Editor + Viewer + non-member on one trip; asserts
  **server-side** enforcement at the API (editor writes succeed; viewer reads but
  writes are rejected; non-member is denied) plus a viewer read-only UI check.
- [`tests/offline-sync.spec.ts`](tests/offline-sync.spec.ts) — offline → online
  sync (M10.2 S2): make plan + journal edits offline, reconnect, and assert the
  deployed API reflects each edit **exactly once** (no loss, no duplication) via
  the app's single shared write queue.
- [`lib/identities.ts`](lib/identities.ts) — mints an authenticated API context
  per test identity (owner/editor/viewer/nonmember) for the role suite.

Run locally against a target:

```sh
cd e2e
npm ci
npm run install-browsers          # one-off: download the Chromium binary
E2E_WEB_URL=https://…  E2E_API_URL=https://…  E2E_LOGIN_SECRET=…  npm test
```

(or copy [`.env.example`](.env.example) to `e2e/.env` and export the values).

## Test auth (no secrets in the repo)

Real sign-in is Google SSO, which can't be automated headlessly. Instead the
harness uses a **guarded backend test-login endpoint** (`POST /auth/test-login`,
M10.1):

- The endpoint is **only registered when `E2E_LOGIN_SECRET` is set** on the API,
  so a normal production service exposes **no test-auth surface** at all.
- `auth.setup.ts` presents that shared secret (from `X-E2E-Login-Secret`); the
  API mints the **same signed, httpOnly session cookie** the real OAuth callback
  issues, for a **fixed, non-admin** test identity (`e2e@khiimori.test`).
- The session is saved to `playwright/.auth/user.json` (git-ignored) and reused
  by the authenticated project via `storageState`, so specs start signed in.

**No secret is committed.** `E2E_LOGIN_SECRET` is supplied at run time (CI
secrets / Secret Manager) and must match the value configured on the target API.

### Multiple identities & invite tokens (M10.2)

The role suite needs more than one identity, so two extra affordances are gated
on the **same** `E2E_LOGIN_SECRET` — production (secret unset) exposes neither:

- **`POST /auth/test-login?identity=owner|editor|viewer|nonmember`** signs in one
  of four fixed, non-admin `.test` identities (`owner` is the default, preserving
  M10.1). The response echoes the identity's `email` so the owner can invite it by
  the exact address it accepts under. `lib/identities.ts` wraps this.
- The **owner-only invitations list** (`GET /trips/{id}/invitations`) surfaces
  each invitation's opaque accept **token** on an E2E-targeted env, so the harness
  can drive the **real invite → accept flow** without an email inbox. Off by
  default, the token stays email-only.

## Environment contract

Config-driven, so the suite can be pointed at a dedicated staging/preview
environment by changing these variables alone — **no code change**:

| Var                | Meaning                                                                                                              | Source (CI)                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `E2E_WEB_URL`      | Web base URL (Firebase Hosting) → Playwright base, and the API's same-origin `/api` base                             | `vars.WEB_BASE_URL`        |
| `E2E_API_URL`      | Raw Cloud Run URL → the bash `/readyz` smoke only (the TS suite reaches the API same-origin at `${E2E_WEB_URL}/api`) | `vars.API_BASE_URL`        |
| `E2E_LOGIN_SECRET` | Shared secret for the guarded test-login endpoint                                                                    | `secrets.E2E_LOGIN_SECRET` |

> v1 has a single environment, so these currently point at it. When a separate
> preview/staging environment exists, repoint the variables — no code change.

## The M01.5 smoke pre-check

[`smoke.sh`](smoke.sh) does a fast, dependency-free liveness check against the
live URLs (API `/readyz` + the web shell) and gates the pipeline. It predates the
Playwright suite and stays as a cheap pre-check:

- **API readiness** — `GET ${E2E_API_URL}/readyz` must return `200`. (`/readyz`
  pings the DB, so this also confirms DB connectivity. We use `/readyz`, not
  `/healthz`: Cloud Run doesn't route external traffic to the liveness path.)
- **Web shell** — `GET ${E2E_WEB_URL}/` must return `200`.

```sh
E2E_API_URL=https://… E2E_WEB_URL=https://… bash e2e/smoke.sh
```

## CI — the staging stage (S3)

The `e2e` job runs after both deploys on a push to `main`, as the pipeline's
**staging stage** (lint → unit → build → integration → deploy → **e2e**). It:

1. runs `smoke.sh` (fast pre-check + wakes the scale-to-zero services);
2. **gates** on `secrets.E2E_LOGIN_SECRET` — when unset the browser run is
   skipped, so the pipeline stays green on the smoke check alone;
3. when the secret is set, installs Playwright (Chromium only) and runs the whole
   suite (`npm test`) against the deployed env — the critical journey **plus** the
   role-based-access and offline-sync suites (M10.2), which reuse this same
   harness/auth/secrets setup (no duplication). Any failing spec fails the job,
   and this is the last stage — so a broken guarantee **fails the pipeline** (the
   release gate).

**To enable the suites in CI**, the author sets the `E2E_LOGIN_SECRET` repo
secret to a high-entropy value **and** configures the same value on the target
API service (`E2E_LOGIN_SECRET` env var, via Secret Manager → Cloud Run). Until
then the stage self-skips — the "configure-to-enable" idiom used by `pulumi-up`
and `restrict-maps-key`.

Making the `e2e` job a **required** check is a branch-protection setting, not a
pipeline change.

### CI minutes (PRD §8.4 #4)

The suite is deliberately lean: a single Chromium browser, one worker, and the
heavy install/run steps only execute when the journey is enabled. The public
repo has unlimited Actions minutes; on a private repo this stays well within the
2,000-minute free cap.
