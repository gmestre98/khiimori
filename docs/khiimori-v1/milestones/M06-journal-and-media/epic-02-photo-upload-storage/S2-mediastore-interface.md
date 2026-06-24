# S2 — `MediaStore` interface & Cloud Storage implementation

## Context
Photos are stored in the **Cloud Storage** bucket (from Milestone 01) behind a thin internal
**`MediaStore` interface** so storage can be swapped without touching callers (PRD §7.0, §7.8).

## Task
Define the `MediaStore` interface and implement it over Cloud Storage.

## Acceptance criteria
- [x] A `MediaStore` interface exposes `Put(object) → url`, `Delete(url)`, and a read/URL method as needed.
- [x] A Cloud Storage implementation backs the interface, using the bucket provisioned in Milestone 01
  (M01.4) and credentials from the runtime service account.
- [x] Callers depend only on the interface (storage is swappable, PRD §7.0).
- [x] A unit test exercises the interface with a faked store (no live bucket needed).

## Constraints
- A Cloud Storage client library is a likely dependency — **confirm with the author before adding it**
  (project rule: stdlib-first, ask before deps).
- Object keys/paths are namespaced per trip to support per-trip quota accounting (Epic 03).

## Definition of done
A `MediaStore` interface with a Cloud Storage implementation exists behind a swappable seam; faked-store
test green.

## Dependencies
Milestone 01 (bucket, service account). Consumed by S3 and Epic 03.
