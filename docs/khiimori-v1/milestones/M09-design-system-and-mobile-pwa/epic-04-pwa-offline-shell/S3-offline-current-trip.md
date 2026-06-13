# S3 — Offline current-trip viewing

## Context
Beyond the shell, **current-trip viewing works offline** (PRD §6 Offline) — the traveller can see their
current trip's data without connectivity.

## Task
Cache current-trip data so it is viewable offline.

## Acceptance criteria
- [ ] The **current trip's** data (days, plan items, stays, budget figures, journal) is cached so it is
  **viewable offline**.
- [ ] Cached data is shown when offline and reconciles with the server when back online.
- [ ] Caching is scoped sensibly (current trip, not the entire history) to respect storage.
- [ ] Offline viewing degrades gracefully for data not cached (clear indication, no crash).

## Constraints
- Coordinate with the offline write queue (S4) so offline edits + cached reads are consistent.
- Keep the cache scope bounded (current trip) — avoid unbounded storage.

## Definition of done
The current trip is viewable offline and reconciles on reconnect.

## Dependencies
S2 (service worker), Milestone 03/04/05/06 (trip data). Write queue in S4.
