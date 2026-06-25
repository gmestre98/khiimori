# S1 — `Invitation` schema & migration

## Context
Invitations have a lifecycle (`status`, `token`) and target an email + role (PRD §9, §11.1). This story
adds the table in the `sharing.*` schema.

## Task
Add a migration for the `Invitation` table.

## Acceptance criteria
- [x] A migration creates `Invitation(id, trip_id, email, role, status, token)` in `sharing.*` with a FK to
  `trip.Trip`.
- [x] `role` is constrained to **Editor | Viewer** (no Owner invites; no per-section permissions in v1,
  PRD §11.1).
- [x] `token` is unique and unguessable; `status` tracks `sent → accepted` (and revoked).
- [x] The migration applies cleanly via the M01.3 runner.

## Constraints
- Follow M01.3 conventions; place in `sharing.*` alongside `TripMembership`.
- Token must be unguessable (security — the invite is a capability).

## Definition of done
The `sharing.Invitation` table exists with Editor/Viewer roles and a lifecycle; migration applies cleanly.

## Dependencies
M03 (trip), Epic 01 (sharing schema). Consumed by S2–S5.
