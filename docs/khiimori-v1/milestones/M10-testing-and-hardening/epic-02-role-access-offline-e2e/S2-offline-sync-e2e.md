# S2 — Offline → online sync E2E

## Context
E2E must cover **offline → online sync** for **journal and plan edits**: changes made offline queue and
reconcile on reconnect with no loss/duplication (PRD §6, Milestones 04/06/09).

## Task
Implement an E2E scenario for offline edits replaying on reconnect.

## Acceptance criteria
- [ ] An E2E scenario drives the PWA **offline** (service worker / network throttling), makes **plan and
  journal edits**, then goes **online** and asserts the edits **synced** (server reflects them).
- [ ] The test asserts **no loss or duplication** after replay (idempotency).
- [ ] It exercises the **single shared offline mechanism** (Milestones 04/06/09), not a mock.
- [ ] Runs on the Epic 01 harness against staging.

## Constraints
- Simulate offline/online deterministically in the runner (network conditions / SW control).
- Cover both plan and journal writes (the two offline-capable surfaces).

## Definition of done
Offline plan and journal edits sync correctly on reconnect, proven end-to-end with no loss/duplication.

## Dependencies
Epic 01 (harness), Milestones 04/06/09 (offline queue + PWA). CI wiring in S3.
