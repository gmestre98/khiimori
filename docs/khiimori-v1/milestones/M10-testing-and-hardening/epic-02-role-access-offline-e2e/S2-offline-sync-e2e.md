# S2 — Offline → online sync E2E

## Context
E2E must cover **offline → online sync** for **journal and plan edits**: changes made offline queue and
reconcile on reconnect with no loss/duplication (PRD §6, Milestones 04/06/09).

## Task
Implement an E2E scenario for offline edits replaying on reconnect.

## Acceptance criteria
- [x] An E2E scenario drives the PWA **offline** (service worker / network throttling), makes **plan and
  journal edits**, then goes **online** and asserts the edits **synced** (server reflects them). —
  `e2e/tests/offline-sync.spec.ts` uses `context.setOffline`; the day plan quick-add was wired to the
  shared offline queue in this story so plan edits are offline-capable (journal already was).
- [x] The test asserts **no loss or duplication** after replay (idempotency). — asserts **exactly one**
  plan item with the unique title and the journal body reflects the text (upsert is idempotent by day).
- [x] It exercises the **single shared offline mechanism** (Milestones 04/06/09), not a mock. — real
  IndexedDB write queue + the app's reconnect replay (`SyncStatus` → `startWriteQueueCoordination`).
- [x] Runs on the Epic 01 harness against staging. — same harness, run via `npm test` in the `e2e` CI
  stage (wiring in S3).

## Constraints
- Simulate offline/online deterministically in the runner (network conditions / SW control).
- Cover both plan and journal writes (the two offline-capable surfaces).

## Definition of done
Offline plan and journal edits sync correctly on reconnect, proven end-to-end with no loss/duplication. ✅ Done — PR #412.

## Dependencies
Epic 01 (harness), Milestones 04/06/09 (offline queue + PWA). CI wiring in S3.
