# S5 — Update/version handling & offline tests

## Context
Cached content must **update correctly when back online** (no stale-forever shell), with defined update/
version handling, and epic AC requires offline tests (install, offline shell load, queued write replay)
(PRD §6, §7.6).

## Task
Implement service-worker update/version handling and add the offline test suite.

## Acceptance criteria
- [ ] A **versioning/update** strategy refreshes the cached shell when a new version deploys (no
  stale-forever); the user gets the update on next launch/refresh per the documented policy.
- [ ] Tests cover: **install** (installable + standalone), **offline shell load**, **offline current-trip
  view** (S3), and **queued write replay on reconnect** (S4).
- [ ] Tests simulate offline/online transitions in CI (no real network dependence).
- [ ] A regression check ensures updates don't strand users on an old cached version.

## Constraints
- Keep update handling simple but correct (avoid the classic stale-SW trap) (PRD §7.0).
- Reuse Milestone 04's queue for the replay test (don't fork it).

## Definition of done
Cached content updates correctly and the PWA offline behaviours are covered by green tests.

## Dependencies
S1–S4, Milestone 04 (queue). Satisfies epic AC; re-verified end-to-end in Milestone 10.
