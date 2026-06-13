# S1 — Membership lifecycle (add / change role / revoke)

## Context
The `sharing` module owns the **full `TripMembership` lifecycle** (PRD §5.9, §9). The table was introduced
in Milestone 03 (S2, `sharing.*` schema) with the Owner row; this story builds the lifecycle operations
on it. Roles are **Owner | Editor | Viewer** (PRD §3).

## Task
Implement add, change-role, and revoke operations for trip memberships.

## Acceptance criteria
- [ ] The `sharing` module exposes **add membership**, **change role**, and **revoke/remove** for a
  `(trip, user)` with role ∈ `Owner | Editor | Viewer`.
- [ ] Operations are **transactional** so access changes can't leave orphaned/over-shared data (PRD §7.7).
- [ ] If the `sharing.*` schema / `TripMembership` table from Milestone 03 needs extension (e.g. a status
  or timestamps), a migration adds it without a data redesign.
- [ ] A unit test covers add, change-role, and revoke.

## Constraints
- Build on the existing `sharing.*` `TripMembership` table (Milestone 03 S2) — extend, don't recreate.
- Capability resolution (what a role can do) is Epic 02 — this story owns the **data/lifecycle**.

## Definition of done
Memberships can be added, role-changed, and revoked transactionally; tests green.

## Dependencies
Milestone 03 S2 (TripMembership table + Owner row). Consumed by Epic 02 (authz), Epic 03 (invites).
