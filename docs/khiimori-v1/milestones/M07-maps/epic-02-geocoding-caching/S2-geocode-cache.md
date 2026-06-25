# S2 — Geocode cache (hit/miss)

## Context
Geocode results are **cached** (in the `geo.*` schema) and reused across map loads to **limit repeat
billable calls** — the PRD's explicit Maps-cost mitigation ("cache map loads") (PRD §8.4 #2). A location
rarely moves.

## Task
Add a persistent geocode cache in front of the provider call (S1).

## Acceptance criteria
- [x] Geocode results are stored in the `geo.*` schema keyed on the location string/identity and reused on
  repeat requests (a repeated location is **not** re-geocoded).
- [x] The cache persists across restarts and serves all users (a location is not user-specific).
- [x] A simple invalidation policy (TTL or manual refresh) is defined and documented (locations rarely
  move — keep it simple, PRD §7.0).
- [x] A unit/integration test covers cache **hit** (no provider call) and **miss** (provider called, then
  cached).

## Constraints
- Keep invalidation minimal in v1 (PRD §7.0).
- The cache reduces billable calls — it is a cost mitigation, treat it as such (PRD §8.4 #2).

## Definition of done
Repeat geocodes are served from the cache, cutting billable calls; hit/miss test green.

## Dependencies
S1 (geocoding), Epic 01 S1 (geo schema). Verified in Milestone 10 cost review.
