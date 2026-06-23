# S2 — Stay CRUD

## Context
A traveller can **add/edit/remove** a stay with name, location, check-in/out, link, and cost (PRD §5.2).
Builds on the `Stay` schema (S1) and the trip authorization layer (M03 Epic 04).

## Task
Implement add/edit/remove endpoints for stays within a trip.

## Acceptance criteria
- [x] Endpoints create, edit, and remove a `Stay` scoped to a trip; only `name` is required on create.
- [x] All operations are **authorized** via the trip `Authorizer` (M03 Epic 04) — only permitted users
  may modify a trip's stays.
- [x] Mutations are **idempotent/queueable** (stable id / upsert semantics) so Epic 06's offline layer can
  replay them.
- [x] A unit test covers add/edit/remove and an unauthorized attempt being denied.

## Constraints
- Reuse the M03 `Authorizer`; do not inline access rules.
- No budget computation here — `cost` is stored only.

## Definition of done
Stays can be added/edited/removed within a trip, authorized and replay-safe; tests green.

## Dependencies
S1, M03 Epic 04 (authz). Multi-night rendering in S3.
