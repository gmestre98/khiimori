# S1 — Ordering scheme & reorder within a day

## Context
Within a day, items can be **reordered**, updating their `order`, keeping the loose/timed mix stable
(PRD §5.3). The ordering scheme must be robust to concurrent/offline edits so replayed reorders converge
(PRD §6).

## Task
Define the ordering scheme and implement reorder within a day.

## Acceptance criteria
- [x] A reorder operation updates `order` for items within a day to reflect a new sequence.
- [x] The ordering scheme is robust to concurrent/offline edits (e.g. fractional or explicit `order`
  values) so replays converge deterministically (PRD §6).
- [x] Reorder is **authorized** (M03 `Authorizer`) and **idempotent/queueable** for offline replay.
- [x] A unit test covers reordering and that timed/untimed items keep a stable combined sequence.

## Constraints
- Choose and document one ordering scheme reused by promote (Epic 03) and move (S2) so all converge.
- No re-create of rows — reorder mutates `order` only.

## Definition of done
Items can be reordered within a day with a convergence-friendly `order` scheme; tests green.

## Dependencies
Epic 02 (PlanItem), Epic 03 (shared order scheme), M03 Epic 04 (authz). Used by S2, Epic 05.
