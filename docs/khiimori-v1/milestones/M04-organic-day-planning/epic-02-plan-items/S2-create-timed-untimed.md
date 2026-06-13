# S2 — Create plan item (title-only) & timed/untimed semantics

## Context
Creating a plan item requires **only a title**; an item is **untimed** when `start_time` is null and
**timed** when a start time (+ optional duration) is set — both first-class (PRD §5.2). Builds on the
schema (S1).

## Task
Implement plan-item creation with title-only minimum and timed/untimed handling.

## Acceptance criteria
- [ ] A create endpoint accepts **only `title`** as required; type, time, duration, location, booking
  status, link, and cost are optional.
- [ ] An item with null `start_time` is **untimed**; with a start time it is **timed** (optional duration).
- [ ] On create the item gets a default `status` and a sensible `order` within its day (or backlog).
- [ ] Creation is **authorized** (M03 `Authorizer`) and **idempotent/queueable** for offline replay.
- [ ] A unit test covers title-only create and timed/untimed creation.

## Constraints
- Never force a time where there isn't one (PRD §5.2).
- `day_id` may be null (backlog) — full promote/demote is Epic 03; create must allow both.

## Definition of done
Plan items can be created with just a title, in timed or untimed form, authorized and replay-safe.

## Dependencies
S1, M03 Epic 04 (authz). Edit/delete in S3.
