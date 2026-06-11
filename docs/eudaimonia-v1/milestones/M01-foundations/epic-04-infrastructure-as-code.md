# Epic M01.4 — Infrastructure as Code (Pulumi/TS)

> Milestone: [01 — Foundations](README.md) · PRD refs: §6, §7.4, §7.8, §8.6.

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

Architecture reference: [assets/04-architecture.svg](../../assets/04-architecture.svg) (PRD §7).
