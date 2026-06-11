# S3 — Cloud Storage bucket

## Context
Journal/media handling (a later milestone) needs object storage; the PRD wants the bucket provisioned as
part of the IaC foundation (PRD §7.8). This story creates a private Cloud Storage bucket via Pulumi with
safe defaults, so feature work later just writes to it behind a thin interface (PRD §7.0).

Assumes the Pulumi scaffold (**S1**) exists.

## Task
Provision a private Cloud Storage bucket via Pulumi with sensible security/lifecycle defaults.

## Acceptance criteria
- [ ] A Cloud Storage bucket is created in the configured region with a config-driven name.
- [ ] **Uniform bucket-level access** is on and the bucket is **private** (no public/allUsers access) (PRD §6, §8.5).
- [ ] Versioning and/or a basic lifecycle rule is set as appropriate (documented choice).
- [ ] The bucket name is a Pulumi **stack output** for the app/service account to consume.
- [ ] `pulumi up`/`destroy` create and remove it cleanly.

## Constraints
- Private by default — media access goes through the service, never public links in v1 (PRD §6).
- Free-tier/standard class; keep it minimal (PRD §7.0).

## Definition of done
`pulumi up` provisions a private, uniform-access bucket and exports its name; no public access is possible.

## Dependencies
S1 (Pulumi scaffold). Granted to the Cloud Run service account in S5.
