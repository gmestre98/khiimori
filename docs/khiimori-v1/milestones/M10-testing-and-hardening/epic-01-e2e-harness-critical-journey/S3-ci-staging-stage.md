# S3 — CI staging stage integration

## Context
E2E runs as the pipeline's **staging stage** (after deploy), gating later stages; the order is lint →
unit → build → integration → deploy → **e2e (staging)** (PRD §7.5). CI minutes are the cost to watch
(PRD §8.4 #4).

## Task
Wire the E2E suite into GitHub Actions as a staging stage.

## Acceptance criteria
- [x] The E2E suite runs in CI **after deploy to staging**, as a distinct pipeline stage (PRD §7.5).
- [x] A failing journey **fails the pipeline** (it is a gate).
- [x] Staging auth/secrets are provided via **CI secrets** (not committed); the run is reproducible.
- [x] **CI-minute usage** is considered (the suite is scoped to keep within the free cap, or the repo is
  public) (PRD §8.4 #4).

> Done in [#407](https://github.com/gmestre98/khiimori/pull/407). The existing `e2e` job (after
> `deploy` + `deploy-web` on `main`) now runs `smoke.sh` then the Playwright suite as the staging stage.
> The browser run is **gated on `secrets.E2E_LOGIN_SECRET`** so it self-skips (main stays green) until the
> author provisions the secret, then activates automatically — the same configure-to-enable idiom as
> `pulumi-up` / `restrict-maps-key`. A failing journey fails the job (the last stage → the pipeline). Lean
> for CI minutes: single Chromium, one worker, heavy steps only when enabled. Making `e2e` a **required**
> check is a branch-protection follow-up (author).

## Constraints
- Fit the existing M01.5 pipeline ordering; don't restructure earlier stages.
- Watch CI minutes — keep the E2E run lean (this is a named cost, PRD §8.4 #4).

## Definition of done
The critical journey runs as a gating staging stage in CI with secrets from CI, mindful of CI minutes.

## Dependencies
S1, S2, Milestone 01 Epic 05 (CI/CD pipeline, staging). Extended by Epic 02 (more E2E).
