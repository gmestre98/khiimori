# S5 — Update/version handling & offline tests

## Context
Cached content must **update correctly when back online** (no stale-forever shell), with defined update/
version handling, and epic AC requires offline tests (install, offline shell load, queued write replay)
(PRD §6, §7.6).

## Task
Implement service-worker update/version handling and add the offline test suite.

## Acceptance criteria
- [x] **Versioning/update strategy** refreshes the cached shell on deploy — no stale-forever. Policy:
  `registerSW` detects waiting worker → posts `SKIP_WAITING` → SW activates → broadcasts `SW_ACTIVATED`
  → `controllerchange` → page reload (update only, not first install).
- [x] Tests cover: **install** (manifest.test.ts + SW contract), **offline shell load** (SW contract
  guards), **offline current-trip view** (isCacheableRead suite), **queued write replay** (full
  offline→enqueue→online→drain cycle).
- [x] Tests simulate offline/online transitions in CI — stubbed `navigator.onLine` + dispatched `online`
  event + fake-indexeddb; no real network.
- [x] Regression check: `CACHE_VERSION` constant asserted in CI; stale-cache cleanup (keep set + filter)
  verified by test.

## Constraints
- Keep update handling simple but correct (avoid the classic stale-SW trap) (PRD §7.0).
- Reuse Milestone 04's queue for the replay test (don't fork it).

## Definition of done
Cached content updates correctly and the PWA offline behaviours are covered by green tests.

## Dependencies
S1–S4, Milestone 04 (queue). Satisfies epic AC; re-verified end-to-end in Milestone 10.
