# S4 — Offline journaling (shared queue/replay)

## Context
Journal text and **photo intents created/edited offline queue and sync** when back online, reusing the
**shared offline mechanism from Milestone 04** (PRD §6). One mechanism, not two.

## Task
Wire journal text and photo uploads into the shared offline queue/replay.

## Acceptance criteria
- [x] Journal **text** entries created/edited offline queue as idempotent writes and replay on reconnect
  (Milestone 04 Epic 06 mechanism).
- [x] **Photo uploads** queue as **deferred binary uploads** that replay when online.
- [x] Behaviour is identical online and offline; sync state is surfaced subtly.
- [x] Replays are idempotent (no duplicate entries/photos) per the shared contract (Milestone 04 S4).

## Constraints
- **Reuse** Milestone 04's queue/replay contract verbatim — do not build a journal-specific queue
  (PRD §7.0).
- Deferred photo uploads must respect the cap on replay (server still enforces, Epic 03).

## Definition of done
Offline journal text and photo uploads queue and sync via the shared mechanism, idempotently.

## Dependencies
S1, S2, Milestone 04 Epic 06 (shared queue), Milestone 09 Epic 04 (service worker, as it lands).
