# Epic M08.1 — Membership & roles model (`sharing.*`)

> Milestone: [08 — Sharing & Backoffice](../README.md) · PRD refs: §3, §5.9, §7.7, §9.

## Description

Establish the `sharing` module and `sharing.*` schema and own the **full `TripMembership`
lifecycle** and reads. Roles are **Owner | Editor | Viewer** (PRD §3). The `Owner` row is created by
Milestone 03; this module owns adding/changing/removing memberships and the reads that the
authorization service (Epic 02) and listing (Milestone 03) depend on. Referential integrity and
transactional updates keep access changes from leaving orphaned or over-shared data.

**Estimated effort:** ~1–2 developer-days (one developer).

## Acceptance Criteria

- [ ] A migration creates the **`sharing.*`** schema with `TripMembership(id, trip_id, user_id,
      role)` where role ∈ `Owner | Editor | Viewer`, using **foreign keys** to trip/user (PRD §7.7,
      §9).
- [ ] The module owns the **membership lifecycle**: add, **change role**, and **revoke/remove**, all
      **transactional** so access changes can't leave orphaned or over-shared data (PRD §5.9, §7.7).
- [ ] Membership **reads** are exposed for Epic 02 (authorization) and Milestone 03's listing
      ("which trips can user U see"); the `Owner` row created by Milestone 03 is recognised here
      (PRD §5.9).
- [ ] Unit + integration tests cover add/change/revoke and referential integrity (PRD §7.6).

## Implementation Details / Architecture

- Lives in the **`sharing` module** with the `sharing.*` schema (PRD §7.1, §7.7).
- Roles map to capabilities per PRD §3 — capability resolution lives in Epic 02; this epic owns the
  **data**: who is a member of what, at which role.
- Foreign keys + transactional updates are the PRD's stated reason for a relational DB in
  safety-critical access control (PRD §7.7).

## Dependencies

- **Upstream:** Milestone 03 (Trip + the `Owner` membership row), Milestone 02 (users), Milestone 01
  (DB/service).
- **Downstream:** Epic 02 (authorization reads memberships), Epic 03 (invites create memberships),
  Epics 04–05 (UI/admin manage them).

## Costs Impact

Negligible — memberships are small relational rows in the existing Neon database (PRD §8, free tier).

## Designs

Trip access/roles surface:
[assets/03-mobile-and-sharing.svg](../../../assets/03-mobile-and-sharing.svg) (PRD §4.3).
