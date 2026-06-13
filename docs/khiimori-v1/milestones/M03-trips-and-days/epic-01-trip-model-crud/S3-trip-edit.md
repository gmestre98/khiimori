# S3 — Trip edit

## Context
A traveller can **edit** a trip's name, destinations, dates, and cover (PRD §5.1). Editing the date range
also drives day generation (Epic 02), so this story exposes the edit operation and emits the change that
Epic 02 hooks.

## Task
Implement a trip edit endpoint updating the editable fields.

## Acceptance criteria
- [ ] An edit endpoint updates `name`, `destinations`, `start_date`, `end_date`, and `cover` for an
  existing trip.
- [ ] `base_currency` stays **EUR** (not editable) and `owner_id` is immutable via this endpoint.
- [ ] A **date-range change** is surfaced so Epic 02's day generation can react (e.g. via a service call /
  domain event) — the wiring point is defined even if Epic 02 implements the regeneration.
- [ ] Input is validated (end ≥ start, reasonable lengths); invalid edits are rejected clearly.
- [ ] A unit test covers a successful edit and a rejected invalid edit (e.g. end before start).

## Constraints
- Authorization is applied via Epic 04's `Authorizer` (owner-only shim in v1) — do not inline access
  rules.
- Keep the day-regeneration trigger as a clean seam so Epic 02 owns the day logic.

## Definition of done
Trips can be edited with validation; a date-range change is exposed for day regeneration; tests green.

## Dependencies
S1, S2. Date-range hook consumed by Epic 02; authz by Epic 04.
