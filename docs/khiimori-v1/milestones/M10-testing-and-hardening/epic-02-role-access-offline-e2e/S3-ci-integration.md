# S3 — CI integration of role & offline suites

## Context
Both suites run in the **staging CI stage** alongside the critical journey (Epic 01 S3) (PRD §7.5). CI
minutes are the cost to watch (PRD §8.4 #4).

## Task
Wire the role-based-access and offline-sync E2E suites into the CI staging stage.

## Acceptance criteria
- [ ] The role (S1) and offline-sync (S2) suites run in the **staging CI stage** with the critical
  journey (Epic 01).
- [ ] Failures **gate** the pipeline.
- [ ] The suites reuse the Epic 01 harness/auth/secrets setup (no duplication).
- [ ] **CI minutes** are considered — the added suites stay within budget (or the repo is public)
  (PRD §8.4 #4).

## Constraints
- Reuse Epic 01's CI staging stage and harness; extend, don't fork.
- Keep runs lean to respect CI minutes (PRD §8.4 #4).

## Definition of done
Role and offline-sync E2E suites gate the pipeline in the staging stage, mindful of CI minutes.

## Dependencies
S1, S2, Epic 01 S3 (CI staging stage). Feeds the release gate.
