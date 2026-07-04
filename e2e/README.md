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

## Environment contract

Config-driven, so the suite can be pointed at a dedicated staging/preview
environment by changing these variables alone — **no code change**:

| Var                | Meaning                                           | Source (CI)                |
| ------------------ | ------------------------------------------------- | -------------------------- |
| `E2E_WEB_URL`      | Web base URL (Firebase Hosting) → Playwright base | `vars.WEB_BASE_URL`        |
| `E2E_API_URL`      | API base URL (Cloud Run) → test-login target      | `vars.API_BASE_URL`        |
| `E2E_LOGIN_SECRET` | Shared secret for the guarded test-login endpoint | `secrets.E2E_LOGIN_SECRET` |

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

## CI (S3)

The `e2e` job already runs after both deploys and gates `main` on `push`. S3
extends it to run the Playwright suite (secret from CI), keeping `smoke.sh` as the
fast pre-check. Making it a required check is a branch-protection setting, not a
pipeline change.
