# S1 — Client-side mutation queue

## Context
Planning must **work offline** on the current trip: mutations are **queued locally** when offline (PRD
§5.3, §6). This story builds the client-side queue that persists pending writes; replay is S2. The queue
is the shared mechanism Milestone 06 also reuses.

## Task
Implement a persistent client-side mutation queue in the `/web` app.

## Acceptance criteria
- [x] Planning mutations (add/edit stay, add/edit/move/reorder/status plan item, promote/demote) are
  enqueued locally when offline, persisted across reloads (e.g. IndexedDB).
- [x] Each queued mutation carries a **stable client-generated id** and enough data to replay it.
- [x] The queue records an order so replay (S2) can apply them deterministically.
- [x] The queue API is generic enough that Milestone 06 (Journal) can reuse it (not planning-specific).

## Constraints
- Confirm any client storage/queue library with the author before adding it (project rule); prefer a thin
  wrapper over platform IndexedDB.
- The queue stores intents; it does not itself talk to the server (that is S2).

## Definition of done
Offline planning mutations persist in a generic local queue with stable ids and ordering.

## Dependencies
Epics 02–04 (mutation shapes), Epic 05 (UI issuing writes). Replay in S2; reused by Milestone 06.
