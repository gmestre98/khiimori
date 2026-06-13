# S5 — Least-privilege service account for Cloud Run

## Context
Cloud Run must run as a **least-privilege service account**, not the default compute SA (PRD §6). This story
provisions a dedicated SA via Pulumi and grants it only what the service needs: read the S4 secrets and use
the S3 bucket. S6 then runs the service as this identity.

Assumes the storage bucket (**S3**) and secrets (**S4**) exist.

## Task
Provision a dedicated Cloud Run service account with least-privilege IAM bindings.

## Acceptance criteria
- [ ] A dedicated service account is created via Pulumi for the Cloud Run service.
- [ ] It is granted **only**: `secretAccessor` on the specific S4 secrets, and object read/write on the **specific**
  S3 bucket — no project-wide or primitive (Owner/Editor) roles (PRD §6).
- [ ] Bindings target named resources, not broad scopes; no key file is generated (Cloud Run uses the attached SA).
- [ ] The SA email is a stack output for S6 to attach.
- [ ] `pulumi up`/`destroy` apply and remove the bindings cleanly.

## Constraints
- Least privilege is mandatory (PRD §6) — resist convenience-wide roles.
- No exported/long-lived SA keys; rely on attached identity + Workload Identity (CI auth is M01.5).

## Definition of done
`pulumi up` creates the SA with only secret-accessor + bucket access; its email is exported for S6.

## Dependencies
S3 (bucket), S4 (secrets). Consumed by S6 (Cloud Run runs as this SA).
