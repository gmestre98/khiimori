# Epic M10.1 — E2E harness & critical journey (CI vs staging)

> Milestone: [10 — Testing & Hardening](../README.md) · PRD refs: §7.0, §7.3, §7.5, §7.6.

## Description

Stand up the **end-to-end test harness** and the **critical-journey** test. Using a TypeScript-based
runner (e.g. Playwright) driving the deployed web/PWA against a **preview/staging environment**, the
journey **sign in → create trip → plan a day → add budget → write journal → share trip** runs **green
in CI** as the pipeline's staging stage. This is the backbone the other E2E epic and the release
gate build on.

**Estimated effort:** ~2–3 developer-days (one developer).

## Acceptance Criteria

- [ ] An **E2E harness** (TypeScript runner, e.g. Playwright) drives the **deployed web/PWA** against
      a **preview/staging** environment (PRD §7.0, §7.3, §7.6).
- [ ] The **critical journey** runs green: **sign in → create trip → plan a day → add budget → write
      journal → share trip** (PRD §7.6).
- [ ] E2E runs as a **staging stage in the GitHub Actions pipeline** (after deploy), gating later
      stages (PRD §7.5).
- [ ] The harness handles auth setup against staging (test identity) without embedding secrets in the
      repo (PRD §6, §8.5).

## Implementation Details / Architecture

- Keeps to the **one-language-per-layer** principle — a TypeScript E2E runner matches the web layer
  (PRD §7.0, §7.3).
- **CI integration (PRD §7.5):** the pipeline order is lint → unit → build → integration → deploy →
  **e2e (staging)**; unit/integration gate earlier stages (those live in feature milestones).
- The staging environment runs on the same **scale-to-zero** services (~€0 idle), so it adds
  negligible standing cost (PRD §8).

## Dependencies

- **Upstream:** Milestone 01 (CI/CD pipeline, staging environment), and feature Milestones 02–08 as
  the journey's steps land.
- **Downstream:** Epic 02 (role/offline E2E extends this harness), Epics 03–05 (reviews lean on a
  working staging deploy).

## Costs Impact

**CI minutes are the cost to watch** — heavy E2E can exceed the **2,000 free GitHub Actions minutes**
on a private repo; keep the repo public or watch minutes (PRD §8.4 #4). Staging adds negligible
standing cost (~€0 idle).

## Designs

No new UI — validates the implemented screens against the directional concepts (PRD §4).
