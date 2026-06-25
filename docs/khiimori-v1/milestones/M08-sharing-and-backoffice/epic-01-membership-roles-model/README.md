# Epic M08.1 — Membership & roles model (`sharing.*`)

> Milestone: [08 — Sharing & Backoffice](../README.md) · PRD refs: §3, §5.9, §7.7, §9.

> **Status:** ✅ Done — all 4 ACs complete across 3 PRs ([#335](https://github.com/gmestre98/khiimori/pull/335), [#336](https://github.com/gmestre98/khiimori/pull/336), [#337](https://github.com/gmestre98/khiimori/pull/337)). Migration widens role CHECK; lifecycle (add/change/revoke) and reads (RoleForUser/MembershipsForUser/MembershipsForTrip) implemented; 8 integration tests cover lifecycle, Owner-row integration, referential integrity, and transactional rollback.

## Description

Establish the `sharing` module and `sharing.*` schema and own the **full `TripMembership`
lifecycle** and reads. Roles are **Owner | Editor | Viewer** (PRD §3). The `Owner` row is created by
Milestone 03; this module owns adding/changing/removing memberships and the reads that the
authorization service (Epic 02) and listing (Milestone 03) depend on. Referential integrity and
transactional updates keep access changes from leaving orphaned or over-shared data.

**Estimated effort:** ~1–2 developer-days (one developer).

## Acceptance Criteria

- [x] A migration creates the **`sharing.*`** schema with `TripMembership(id, trip_id, user_id,
      role)` where role ∈ `Owner | Editor | Viewer`, using **foreign keys** to trip/user (PRD §7.7,
      §9).
- [x] The module owns the **membership lifecycle**: add, **change role**, and **revoke/remove**, all
      **transactional** so access changes can't leave orphaned or over-shared data (PRD §5.9, §7.7).
- [x] Membership **reads** are exposed for Epic 02 (authorization) and Milestone 03's listing
      ("which trips can user U see"); the `Owner` row created by Milestone 03 is recognised here
      (PRD §5.9).
- [x] Unit + integration tests cover add/change/revoke and referential integrity (PRD §7.6).

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

## User stories

The epic is split into **3 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-membership-lifecycle.md) | Membership lifecycle (add / change role / revoke) | ~3h | AC1, AC2 | M03 S2 (membership table) |
| [S2](S2-membership-reads.md) | Membership reads for authorization & listing | ~2.5h | AC3 | S1, M03 |
| [S3](S3-integrity-tests.md) | Referential integrity & lifecycle tests | ~3h | AC4 | S1, S2 |

**Total:** ~8.5h (≈ 1–2 dev-days), consistent with the epic's ~1–2 dev-day estimate.

### Sequencing

```
S1 Membership lifecycle ── S2 Membership reads ── S3 Integrity & lifecycle tests
```

> The `TripMembership` table (and the Owner row) was introduced in Milestone 03 S2 in the `sharing.*`
> schema — this epic **extends** its lifecycle, no data redesign.
