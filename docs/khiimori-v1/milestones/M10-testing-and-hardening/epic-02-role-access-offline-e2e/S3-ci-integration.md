# S3 — CI integration of role & offline suites

## Context
Both suites run in the **staging CI stage** alongside the critical journey (Epic 01 S3) (PRD §7.5). CI
minutes are the cost to watch (PRD §8.4 #4).

## Task
Wire the role-based-access and offline-sync E2E suites into the CI staging stage.

## Acceptance criteria
- [x] The role (S1) and offline-sync (S2) suites run in the **staging CI stage** with the critical
  journey (Epic 01). — the `e2e` job's `npm test` runs the whole Playwright suite; the new specs live in
  `e2e/tests/` so they run automatically. Job/step names + comments updated to name all three suites.
- [x] Failures **gate** the pipeline. — the `e2e` job is the last stage after both deploys; any failing
  spec fails the job and thus the pipeline (the release gate).
- [x] The suites reuse the Epic 01 harness/auth/secrets setup (no duplication). — same
  `playwright.config.ts`, `auth.setup.ts`/`storageState`, `env.ts` contract, and `E2E_LOGIN_SECRET` gate;
  extended, not forked.
- [x] **CI minutes** are considered — the added suites stay within budget (or the repo is public)
  (PRD §8.4 #4). — still one Chromium, one worker, install/run only when the secret gate is on; the repo
  is public (unlimited Actions minutes).

## Constraints
- Reuse Epic 01's CI staging stage and harness; extend, don't fork.
- Keep runs lean to respect CI minutes (PRD §8.4 #4).

## Definition of done
Role and offline-sync E2E suites gate the pipeline in the staging stage, mindful of CI minutes. ✅ Done — PR #413.

## Dependencies
S1, S2, Epic 01 S3 (CI staging stage). Feeds the release gate.
