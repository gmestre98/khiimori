# S1 — E2E harness (runner + staging + auth setup)

## Context
Milestone 10 owns the cross-cutting **end-to-end** suite. A TypeScript runner (e.g. Playwright) drives the
deployed web/PWA against a **preview/staging** environment, keeping to one language per layer (PRD §7.0,
§7.3, §7.6). This story sets up the harness and test-auth against staging.

## Task
Set up the E2E harness and an auth setup that works against staging without committing secrets.

## Acceptance criteria
- [x] A **TypeScript E2E runner** (e.g. Playwright) is configured to drive the **deployed web/PWA** against
  a **staging** URL.
- [x] A **test-auth** approach signs a test identity into staging (Google SSO test path or a documented
  staging auth shortcut) **without embedding secrets** in the repo (PRD §6, §8.5).
- [x] The harness runs locally against staging and is structured for CI (S3).
- [x] A smoke test (load app, reach sign-in) passes to prove the harness works.

> Done in [#405](https://github.com/gmestre98/khiimori/pull/405). **Playwright** under `e2e/` drives the
> deployed app (config-driven `E2E_WEB_URL` / `E2E_API_URL`). Test-auth is a **guarded backend
> `POST /auth/test-login`** endpoint — registered only when `E2E_LOGIN_SECRET` is set, so normal prod has
> no test-auth surface and no secret lives in the repo (supplied at run time). `auth.setup.ts` mints the
> session into `storageState`; `smoke.spec.ts` covers the anonymous sign-in reach and the authenticated
> path. Runner + test-auth approach confirmed with the author before adding.

## Constraints
- Confirm the E2E runner choice with the author before adding it (project rule: ask before deps) —
  Playwright is the PRD's example.
- No secrets in the repo; staging credentials come from CI secrets / Secret Manager.

## Definition of done
A TypeScript E2E harness drives staging with test-auth and a passing smoke test, ready for the journey
(S2) and CI (S3).

## Dependencies
Milestone 01 (CI/CD, staging env), Milestone 02 (auth). Journey in S2; CI wiring in S3.
