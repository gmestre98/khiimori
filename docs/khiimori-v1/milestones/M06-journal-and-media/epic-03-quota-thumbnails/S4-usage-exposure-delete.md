# S4 — Usage exposure & delete decrement

## Context
The UI **shows per-trip usage and warns as the cap approaches** (PRD §5.5), and deleting a photo must
**decrement usage** so the cap reflects reality.

## Task
Expose per-trip usage for the UI and decrement usage on photo deletion.

## Acceptance criteria
- [x] An endpoint exposes **per-trip usage** (used bytes / cap, and a near-cap indication) for the UI
  (Epic 04) to display and warn.
- [x] Deleting a photo removes its object(s) via `MediaStore` and **decrements** the trip's usage.
- [x] Usage stays accurate across add/delete cycles (no drift).
- [x] A unit test covers delete decrementing usage and the exposed usage value.

## Constraints
- Deletion removes the original and any variants and adjusts usage atomically with the row delete.
- The exposed value is the same figure the server enforces (single source of truth, S1).

## Definition of done
Per-trip usage is exposed for the warn UI and stays accurate as photos are added and deleted.

## Dependencies
S1 (usage), S2 (cap), Epic 02 (MediaStore). Consumed by Epic 04; tested in S5.
