# Epic M01.5 — CI/CD Pipeline (GitHub Actions)

> Milestone: [01 — Foundations](../README.md) · PRD refs: §7.5, §7.6, §8.4.

## Description

Automate the path from commit to running service with GitHub Actions: lint, test, build, and — on
`main` — containerise, push to Artifact Registry, and deploy to Cloud Run, with a staging hook for
the e2e suite that Milestone 10 fills in.

**Estimated effort:** ~3–4 developer-days (one developer).

## Acceptance Criteria

- [ ] On every change: `lint → unit tests → build` runs and gates the change (PRD §7.5).
- [ ] An integration-test stage runs against an ephemeral DB (PRD §7.6).
- [ ] On `main`: build container → push to Artifact Registry → deploy to Cloud Run.
- [ ] The web app builds and deploys to Firebase Hosting from the pipeline.
- [ ] A placeholder e2e stage runs against a preview/staging environment (journeys added in Milestone 10).

## Implementation Details / Architecture

- Pipeline stages map directly to PRD §7.5: lint → unit → build → integration → (main) deploy → e2e.
- Deploy steps consume the IaC-provisioned resources (M01.4) and Secret Manager — no secrets in CI logs.
- Migrations (M01.3) run as part of deploy/integration.

## Dependencies

- **Upstream:** M01.2 (buildable service), M01.3 (migrations), M01.4 (deploy targets + secrets).
- **Downstream:** M01.6/M01.7 ride this pipeline; Milestone 10 fills the e2e stage.

## Costs Impact

**CI minutes are the cost to watch** (PRD §8.4 #4): heavy runs can exceed the **2,000 free GitHub
Actions minutes** on a private repo — keep the repo public or watch minutes. Compute/deploy targets
remain free-tier.

## Designs

N/A (pipeline).

## User stories

The epic is split into **9 small user stories**, each sized **≤4h for one developer**
(implementation + tests + review). Each story file is a standalone agent-ready prompt — hand a
single file to a coding agent and it has enough context (background, task, acceptance criteria,
constraints, dependencies, definition of done) to implement it without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-ci-lint-unit.md) | CI workflow: lint + unit tests on every change | ~3.5h | AC1 | — (M01.1/2) |
| [S2](S2-build-stage.md) | Build stage (service binary + web bundle) | ~2.5h | AC1 | S1 |
| [S3](S3-containerise-service.md) | Containerise the service (Dockerfile) | ~3h | AC3 | S2 |
| [S4](S4-integration-test-stage.md) | Integration-test stage against ephemeral DB | ~3.5h | AC2 | S1 (M01.3 S7) |
| [S5](S5-gcp-auth-wif.md) | GCP auth from Actions (Workload Identity Federation) | ~3h | AC3 | S1 (M01.4) |
| [S6](S6-build-push-image.md) | On `main`: build & push image to Artifact Registry | ~3h | AC3 | S3, S5 |
| [S7](S7-deploy-cloud-run.md) | On `main`: deploy to Cloud Run (with migrations) | ~3.5h | AC3 | S6 (M01.3/4) |
| [S8](S8-deploy-web-firebase.md) | Web build & deploy to Firebase Hosting | ~3h | AC4 | S2, S5 (M01.4) |
| [S9](S9-e2e-placeholder-stage.md) | Placeholder e2e stage against staging | ~2.5h | AC5 | S7, S8 |

**Total:** ~27.5h (≈ 3.5 dev-days), consistent with the epic's ~3–4 dev-day estimate.

### Sequencing

```
S1 Lint + unit ─┬─ S2 Build ── S3 Containerise ─┐
                ├─ S4 Integration test           ├─ S6 Build & push ── S7 Deploy Cloud Run ─┐
                └─ S5 GCP auth (WIF) ─────────────┘                                          ├─ S9 e2e placeholder
                   └────────────────── S8 Web deploy (needs S2 + S5) ───────────────────────┘
```

S4 (integration) runs alongside the build/containerise track; the `main`-only deploy stages (S6–S8) all
need WIF auth (S5).
