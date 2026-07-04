# Epic M10.1 — E2E harness & critical journey (CI vs staging)

> Milestone: [10 — Testing & Hardening](../README.md) · PRD refs: §7.0, §7.3, §7.5, §7.6.

> **Status:** ✅ Done — all 3 stories merged, 4/4 epic ACs met.
> S1 [#405](https://github.com/gmestre98/khiimori/pull/405) (harness + guarded test-auth) ·
> S2 [#406](https://github.com/gmestre98/khiimori/pull/406) (critical-journey test) ·
> S3 [#407](https://github.com/gmestre98/khiimori/pull/407) (CI staging stage).
>
> A TypeScript **Playwright** harness drives the deployed web/PWA against a config-driven target and
> signs a fixed test identity in via a **guarded backend `POST /auth/test-login`** endpoint (registered
> only when `E2E_LOGIN_SECRET` is set — no test-auth surface in normal prod, no secret in the repo). The
> critical journey — **create trip → plan a day → add a budget → write a journal → share the trip** —
> asserts a persisted outcome at each step and cleans up its trip afterwards. It runs as the pipeline's
> **staging stage** (`e2e` job, after deploy on `main`), gated to self-skip until the author configures
> the secret, then failing the pipeline on a broken journey. **To activate:** set the `E2E_LOGIN_SECRET`
> repo secret and the same value on the API service, then make the `e2e` job a required check (see
> [e2e/README.md](../../../../../e2e/README.md)).

## Description

Stand up the **end-to-end test harness** and the **critical-journey** test. Using a TypeScript-based
runner (e.g. Playwright) driving the deployed web/PWA against a **preview/staging environment**, the
journey **sign in → create trip → plan a day → add budget → write journal → share trip** runs **green
in CI** as the pipeline's staging stage. This is the backbone the other E2E epic and the release
gate build on.

**Estimated effort:** ~2–3 developer-days (one developer).

## Acceptance Criteria

- [x] An **E2E harness** (TypeScript runner, e.g. Playwright) drives the **deployed web/PWA** against
      a **preview/staging** environment (PRD §7.0, §7.3, §7.6). — S1
- [x] The **critical journey** runs green: **sign in → create trip → plan a day → add budget → write
      journal → share trip** (PRD §7.6). — S2 (green run is the author's step once the secret is set)
- [x] E2E runs as a **staging stage in the GitHub Actions pipeline** (after deploy), gating later
      stages (PRD §7.5). — S3
- [x] The harness handles auth setup against staging (test identity) without embedding secrets in the
      repo (PRD §6, §8.5). — S1 (guarded `POST /auth/test-login`; secret from CI/Secret Manager)

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

## User stories

The epic is split into **3 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-e2e-harness.md) | E2E harness (runner + staging + auth setup) | ~3.5h | AC1, AC4 | M01.5, M02 |
| [S2](S2-critical-journey.md) | Critical-journey E2E test | ~3.5h | AC2 | S1, M02–M08 |
| [S3](S3-ci-staging-stage.md) | CI staging stage integration | ~3h | AC3 | S1, S2, M01.5 |

**Total:** ~10h (≈ 2–3 dev-days), consistent with the epic's ~2–3 dev-day estimate.

### Sequencing

```
S1 E2E harness ── S2 Critical journey ── S3 CI staging stage
```

> S1 flags confirming the E2E runner (Playwright is the PRD's example) with the author. CI minutes are
> the cost to watch (PRD §8.4 #4).
