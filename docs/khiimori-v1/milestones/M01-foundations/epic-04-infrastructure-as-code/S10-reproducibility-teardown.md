# S10 — Reproducible `pulumi up` & documented teardown

> **Status:** ✅ Done — reproducible pulumi up + documented teardown (#117). Deployed live to the dev stack.

## Context
The epic's contract is that `pulumi up` provisions a **clean environment reproducibly** and teardown is
**documented** (epic AC5). This closing story verifies the whole stack stands up from scratch on a fresh
stack, exports the outputs downstream milestones depend on, and writes the up/destroy runbook.

Assumes all resource stories (**S2–S9**) are in place.

## Task
Verify clean end-to-end provisioning on a fresh stack and document the up/teardown procedure.

## Acceptance criteria
- [x] On a **new, empty** stack, `pulumi up` provisions the full set (Artifact Registry, bucket, secrets, SA,
  Cloud Run, Hosting site, scale config) without manual fix-ups beyond the documented author-provided prerequisites
  (GCP project + billing, Firebase project, secret values).
- [x] All required **stack outputs** are exported and listed: Cloud Run URL, Hosting origin, image-path prefix,
  bucket name, secret ids.
- [x] `pulumi destroy` tears everything down cleanly; any intentionally retained resources (and why) are noted.
- [x] A short **runbook** documents prerequisites, `pulumi up`, outputs, and teardown.
- [x] API enablement and resource creation ordering are handled by IaC (no undocumented manual steps).

## Constraints
- Reproducibility over cleverness — a fresh checkout + documented prerequisites must reach a running stack (PRD §7.0).
- Don't leave orphaned billable resources after `destroy` (PRD §8).

## Definition of done
A reviewer creates a fresh stack, runs `pulumi up` to a complete environment using only the documented
prerequisites, then `pulumi destroy` leaves it clean.

## Dependencies
S2–S9 (all resources). Consumed by M01.5 (CI uses these resources/outputs), M01.6, M01.7, M01.8.
