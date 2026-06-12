# S3 — CI staging stage integration

## Context
E2E runs as the pipeline's **staging stage** (after deploy), gating later stages; the order is lint →
unit → build → integration → deploy → **e2e (staging)** (PRD §7.5). CI minutes are the cost to watch
(PRD §8.4 #4).

## Task
Wire the E2E suite into GitHub Actions as a staging stage.

## Acceptance criteria
- [ ] The E2E suite runs in CI **after deploy to staging**, as a distinct pipeline stage (PRD §7.5).
- [ ] A failing journey **fails the pipeline** (it is a gate).
- [ ] Staging auth/secrets are provided via **CI secrets** (not committed); the run is reproducible.
- [ ] **CI-minute usage** is considered (the suite is scoped to keep within the free cap, or the repo is
  public) (PRD §8.4 #4).

## Constraints
- Fit the existing M01.5 pipeline ordering; don't restructure earlier stages.
- Watch CI minutes — keep the E2E run lean (this is a named cost, PRD §8.4 #4).

## Definition of done
The critical journey runs as a gating staging stage in CI with secrets from CI, mindful of CI minutes.

## Dependencies
S1, S2, Milestone 01 Epic 05 (CI/CD pipeline, staging). Extended by Epic 02 (more E2E).
