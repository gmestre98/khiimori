# Epic M01.4 — Infrastructure as Code (Pulumi/TS)

> Milestone: [01 — Foundations](../README.md) · PRD refs: §6, §7.4, §7.8, §8.6.

## Description

Define all cloud infrastructure in Pulumi (TypeScript) targeting GCP: the Cloud Run service,
Artifact Registry, Cloud Storage bucket, Secret Manager, and the Firebase Hosting site, with
secrets injected at runtime and scale tunables expressed as config. One language across infra and
scripting (PRD §7.4).

**Estimated effort:** ~4–5 developer-days (one developer).

## Acceptance Criteria

- [ ] Pulumi (TS) provisions the Cloud Run service, Artifact Registry repo, a Cloud Storage bucket, and Secret Manager secrets (PRD §7.8).
- [ ] The Firebase Hosting site (for M01.6) is provisioned/configured via IaC.
- [ ] Secrets (DB URL, OAuth client, Maps key) are injected into Cloud Run **at runtime from Secret Manager** — none committed or shipped to the client (PRD §6, §8.5).
- [ ] Scale tunables — Cloud Run `min-instances`, Neon tier reference, Maps quota — are **IaC config** defaulting to scale-to-zero (PRD §8.6).
- [ ] `pulumi up` provisions a clean environment reproducibly; teardown documented.

## Implementation Details / Architecture

- Third-party integrations (Maps, OAuth, storage) are referenced behind config so they can be
  swapped cheaply (PRD §7.0).
- Tunables live as config so scale-up is "change a setting," matching the dashboard-toggleable goal
  of PRD §8.6 (the cost-guardrail specifics — billing budget, Maps caps — are in M01.8, also IaC).
- Least-privilege service accounts for Cloud Run (PRD §6).

## Dependencies

- **Upstream:** M01.1 (`/infra` dir), M01.2 (a service image to deploy), M01.3 (DB to reference).
  Author-provided: GCP project with billing enabled, Firebase project.
- **Downstream:** M01.5 (CI deploys using these resources), M01.6 (hosting), M01.8 (extends IaC with cost guardrails).

## Costs Impact

Provisions billable resources, but all are **scale-to-zero / free-tier** so idle cost is ≈€0
(PRD §8.1, §8.8). Note: **billing must be enabled** on the GCP project even within free allowances
(PRD §8.3). The actual budget/alert + Maps caps are set in M01.8.

## Designs

Architecture reference: [assets/04-architecture.svg](../../../assets/04-architecture.svg) (PRD §7).

## User stories

The epic is split into **10 small user stories**, each sized **≤4h for one developer**
(implementation + tests + review). Each story file is a standalone agent-ready prompt — hand a
single file to a coding agent and it has enough context (background, task, acceptance criteria,
constraints, dependencies, definition of done) to implement it without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-pulumi-project-scaffold.md) | Pulumi (TS) project scaffold & GCP provider | ~3h | AC1 | — (M01.1) |
| [S2](S2-artifact-registry.md) | Artifact Registry repository | ~2h | AC1 | S1 |
| [S3](S3-storage-bucket.md) | Cloud Storage bucket | ~2.5h | AC1 | S1 |
| [S4](S4-secret-manager.md) | Secret Manager secrets | ~3h | AC1, AC3 | S1 |
| [S5](S5-cloud-run-service-account.md) | Least-privilege service account for Cloud Run | ~3h | AC1 | S3, S4 |
| [S6](S6-cloud-run-service.md) | Cloud Run service | ~3.5h | AC1 | S2, S5 |
| [S7](S7-runtime-secret-injection.md) | Inject secrets into Cloud Run at runtime | ~3h | AC3 | S4, S5, S6 |
| [S8](S8-firebase-hosting-site.md) | Firebase Hosting site (IaC) | ~3h | AC2 | S1 |
| [S9](S9-scale-tunables-config.md) | Scale tunables as IaC config (default scale-to-zero) | ~3h | AC4 | S6 |
| [S10](S10-reproducibility-teardown.md) | Reproducible `pulumi up` & documented teardown | ~3h | AC5 | S2–S9 |

**Total:** ~29h (≈ 4 dev-days), consistent with the epic's ~4–5 dev-day estimate.

### Sequencing

```
S1 Pulumi scaffold
   ├─ S2 Artifact Registry ─┐
   ├─ S3 Storage bucket ──┐ │
   ├─ S4 Secret Manager ──┴─┴─ S5 Service account ── S6 Cloud Run ─┬─ S7 Runtime secrets
   └─ S8 Firebase Hosting site                                     └─ S9 Scale tunables
S10 Reproducibility + teardown  ◄── needs S2–S9
```

S8 (Hosting) runs in parallel with the Cloud Run track; S2/S3/S4 all fan out from S1.
