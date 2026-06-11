# S2 — Artifact Registry repository

## Context
The CI pipeline (M01.5) builds the service container and pushes it to **Artifact Registry**, from which
Cloud Run deploys (PRD §7.8). This story provisions that Docker repository in Pulumi so a tagged image has
a home before the Cloud Run service (S6) references it.

Assumes the Pulumi scaffold (**S1**) exists.

## Task
Provision a GCP Artifact Registry Docker repository via Pulumi, exporting its address for CI and Cloud Run.

## Acceptance criteria
- [ ] An Artifact Registry **Docker** repository is created in the configured region.
- [ ] Its name/location come from stack config; the full image-path prefix is a Pulumi **stack output**.
- [ ] Required GCP APIs (e.g. `artifactregistry.googleapis.com`) are enabled via IaC.
- [ ] `pulumi up` creates it cleanly and `pulumi destroy` removes it.

## Constraints
- Single repo is enough for v1 (PRD §7.0) — no per-service sprawl.
- Free-tier/standard storage; no extra replication.

## Definition of done
`pulumi up` provisions the repo and exports its image-path prefix; the value is usable by M01.5 to push images.

## Dependencies
S1 (Pulumi scaffold). Consumed by S6 (Cloud Run) and M01.5 (image push).
