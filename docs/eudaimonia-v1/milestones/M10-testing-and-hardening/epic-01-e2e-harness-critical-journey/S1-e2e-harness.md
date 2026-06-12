# S1 — E2E harness (runner + staging + auth setup)

## Context
Milestone 10 owns the cross-cutting **end-to-end** suite. A TypeScript runner (e.g. Playwright) drives the
deployed web/PWA against a **preview/staging** environment, keeping to one language per layer (PRD §7.0,
§7.3, §7.6). This story sets up the harness and test-auth against staging.

## Task
Set up the E2E harness and an auth setup that works against staging without committing secrets.

## Acceptance criteria
- [ ] A **TypeScript E2E runner** (e.g. Playwright) is configured to drive the **deployed web/PWA** against
  a **staging** URL.
- [ ] A **test-auth** approach signs a test identity into staging (Google SSO test path or a documented
  staging auth shortcut) **without embedding secrets** in the repo (PRD §6, §8.5).
- [ ] The harness runs locally against staging and is structured for CI (S3).
- [ ] A smoke test (load app, reach sign-in) passes to prove the harness works.

## Constraints
- Confirm the E2E runner choice with the author before adding it (project rule: ask before deps) —
  Playwright is the PRD's example.
- No secrets in the repo; staging credentials come from CI secrets / Secret Manager.

## Definition of done
A TypeScript E2E harness drives staging with test-auth and a passing smoke test, ready for the journey
(S2) and CI (S3).

## Dependencies
Milestone 01 (CI/CD, staging env), Milestone 02 (auth). Journey in S2; CI wiring in S3.
