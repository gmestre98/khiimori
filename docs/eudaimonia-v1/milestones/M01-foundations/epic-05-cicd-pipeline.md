# Epic M01.5 — CI/CD Pipeline (GitHub Actions)

> Milestone: [01 — Foundations](README.md) · PRD refs: §7.5, §7.6, §8.4.

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
