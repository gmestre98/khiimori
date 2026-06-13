# e2e

End-to-end tests that run against the **deployed** environment in CI, after the
deploy stages (M01.5 S7/S8). Today this is a **placeholder smoke stage**;
Milestone 10 fills in the real critical-journey tests here.

## What runs today (placeholder — M01.5 S9)

[`smoke.sh`](smoke.sh) does a real check against the live URLs and gates the
pipeline:

- **API readiness** — `GET ${E2E_API_URL}/readyz` must return `200`. (`/readyz`
  pings the DB, so this also confirms DB connectivity. We use `/readyz`, not
  `/healthz`: Cloud Run doesn't route external traffic to the liveness-probe
  path.)
- **Web shell** — `GET ${E2E_WEB_URL}/` must return `200` (Firebase Hosting
  serves the SPA shell).

It runs in the `e2e` CI job (`.github/workflows/ci.yml`) on `main`, after the
Cloud Run + Firebase Hosting deploys.

## Environment contract

The target is **config-driven** — the job passes these from repo variables, so it
can be pointed at a dedicated staging/preview environment later **without changing
the workflow or the specs**:

| Var           | Meaning                                  | Source (CI)            |
| ------------- | ---------------------------------------- | ---------------------- |
| `E2E_API_URL` | API base URL (Cloud Run service)         | `vars.API_BASE_URL`    |
| `E2E_WEB_URL` | Web base URL (Firebase Hosting)          | `vars.WEB_BASE_URL`    |

> v1 has a single environment, so these currently point at it. When a separate
> preview/staging environment exists, repoint the variables — no code change.

Run locally:

```sh
E2E_API_URL=https://… E2E_WEB_URL=https://… bash e2e/smoke.sh
```

## How Milestone 10 extends this (no re-plumbing)

The stage, environment contract, and gate are already in place. M10 adds the
critical-journey tests (e.g. **Playwright**) here:

1. Add the test runner + specs under `e2e/` (e.g. `e2e/tests/*.spec.ts`,
   `playwright.config.ts`) reading the same `E2E_API_URL` / `E2E_WEB_URL`.
2. Extend the `e2e` job to run them (keep `smoke.sh` as a fast pre-check or fold
   it into a Playwright health spec).
3. The job already runs after deploy and gates `main`; making it a required check
   is a branch-protection setting, not a pipeline change.
