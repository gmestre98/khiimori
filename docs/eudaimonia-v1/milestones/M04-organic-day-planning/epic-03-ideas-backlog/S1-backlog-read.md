# S1 — Ideas backlog list (`day_id = null`)

## Context
The **parking lot** of unscheduled ideas is a set of `PlanItem`s with `day_id = null`, at trip (and/or
day) level (PRD §5.2, §9). This story exposes reading the backlog.

## Task
Expose a read for a trip's backlog ideas.

## Acceptance criteria
- [ ] An endpoint returns a trip's `PlanItem`s with `day_id = null` (the backlog), ordered by `order`.
- [ ] The read is **authorized** via the M03 `Authorizer`.
- [ ] The response is suitable for the day-view/backlog UI (Epic 05) to render and act on.

## Constraints
- Reuse the `PlanItem` model from Epic 02 — no new entity.
- Backlog is just `day_id = null`; do not add a separate table.

## Definition of done
A trip's backlog ideas are readable, authorized, and ordered.

## Dependencies
Epic 02 (PlanItem), M03 Epic 04 (authz). Promote/demote in S2.
