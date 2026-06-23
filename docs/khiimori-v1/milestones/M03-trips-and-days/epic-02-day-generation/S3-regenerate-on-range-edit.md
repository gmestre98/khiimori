# S3 — Regenerate days on range edit (add/remove, shrink guard)

## Context
On a date-range edit, **shrinking** removes now-out-of-range days **with a guard/confirm if they hold
data**, and **extending** adds new days without disturbing existing ones (PRD §5.1). This consumes the
date-range change emitted by Epic 01 S3.

## Task
Implement day reconciliation on a trip date-range change.

## Acceptance criteria
- [x] Extending the range **adds** the new dates' days; existing days (and their attached data) are
  untouched, with `index` kept consistent.
- [x] Shrinking the range **removes** out-of-range days, but if a removed day **holds data** (plan items,
  journal, etc.), the operation requires a **guard/confirm** signal rather than silently destroying data.
- [x] Reconciliation runs **transactionally** and is idempotent.
- [x] Unit tests cover extend (adds), shrink-empty (removes), and shrink-with-data (guarded).

## Constraints
- The "holds data" check spans later milestones' tables — define it via a seam/interface so it works as
  those land (Milestones 04/06); in v1 it must at least guard against destroying days with plan items.
- Reuse S2's pure generation function for the add side.

## Definition of done
Range edits add/remove days transactionally, with a guard preventing silent data loss on shrink; tests
green.

## Dependencies
S1, S2, Epic 01 S3 (date-range change hook). Guard seam consumed by Milestones 04/06.
