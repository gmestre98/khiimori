# S2 — 1 GB-per-trip cap enforcement

## Context
The **1 GB-per-trip cap is enforced server-side before persisting**: uploads beyond the cap are rejected
with a clear message (PRD §5.5, §11.4). This is a **cost guardrail**, not a UI nicety (PRD §8.4).

## Task
Enforce the per-trip 1 GB cap in the upload pipeline, before storing.

## Acceptance criteria
- [x] The upload pipeline (Epic 02 S3 seam) checks per-trip usage (S1) **before** `MediaStore.Put`; an
  upload that would exceed 1 GB is **rejected** without storing.
- [x] The rejection returns a **clear message** the UI can surface (Epic 04).
- [x] The check is **server-side** and cannot be bypassed by a crafted client request.
- [x] A unit test covers under-cap (allowed), at-cap boundary, and over-cap (rejected, nothing stored).

## Constraints
- Enforce before persisting the object and the `Photo` row (no partial writes on rejection).
- The cap value (1 GB) is configurable but defaults to 1 GB (PRD §11.4).

## Definition of done
Uploads beyond 1 GB/trip are rejected server-side with a clear message and no storage; tests green.

## Dependencies
S1 (usage), Epic 02 S3 (upload seam). Surfaced in Epic 04; tested in S5.
