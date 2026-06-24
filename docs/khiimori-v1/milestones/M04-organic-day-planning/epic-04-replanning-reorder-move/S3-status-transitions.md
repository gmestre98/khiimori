# S3 — Status transitions (done / skipped / cancelled)

## Context
Items can be marked **`done`, `skipped`, or `cancelled`** (over the `idea | planned | done | skipped |
cancelled` set) so the day records what happened (PRD §9). v1 keeps it simple — no rigid state machine
(PRD §7.0).

## Task
Implement status transitions on a plan item.

## Acceptance criteria
- [x] A status operation sets an item's `status` to any value in the allowed set.
- [x] Status changes are **authorized** (M03 `Authorizer`) and **idempotent/queueable** for offline
  replay.
- [x] The model permits any transition (no rigid state machine) but rejects values outside the set.
- [x] A unit test covers setting each status and rejecting an invalid value.

## Constraints
- Keep it simple — no enforced transition graph in v1 (PRD §7.0).
- Status drives the done/skipped/cancelled rendering in Epic 05 (note the boundary).

## Definition of done
Plan items can be marked done/skipped/cancelled (and back), authorized and replay-safe; tests green.

## Dependencies
Epic 02 (PlanItem + status set), M03 Epic 04 (authz). Rendering in Epic 05.
