# Epic M03.1 — Trip data model & CRUD (`trip.*`, owner membership)

> **Status:** ✅ Done — all 5 stories merged (PRs [#192](https://github.com/gmestre98/khiimori/pull/192)–[#196](https://github.com/gmestre98/khiimori/pull/196)) and all 5 acceptance criteria verified. Trip CRUD (create/edit/archive/unarchive/delete) is live; owner `TripMembership` is written transactionally on create; delete cascades memberships explicitly across schemas; day-regeneration seam is wired for Epic 02.
>
> Milestone: [03 — Trips & Days](../README.md) · PRD refs: §5.1, §7.7, §9.

## Description

Establish the `trip` module and `trip.*` schema, and implement **create / edit / archive / delete**
for a trip: name, destinations, start/end date, cover image, `base_currency = EUR` (fixed), and
`status`. Archive hides a trip from active lists without deleting; delete removes the trip and
**cascades** its days/owned entities transactionally. The trip **owner** is recorded as a
`TripMembership` with role `Owner` at creation (full membership lifecycle is Milestone 08).

**Estimated effort:** ~2–3 developer-days (one developer).

## Acceptance Criteria

- [x] A migration creates the **`trip.*`** schema with `Trip(id, owner_id, name, destinations,
      start_date, end_date, base_currency, cover, status)` per PRD §9 (PRD §7.7).
- [x] **Create / edit / archive / delete** a trip is implemented; `base_currency` is fixed to **EUR**
      and `status` carries the active/archived state (PRD §5.1).
- [x] **Delete cascades** the trip's days and owned entities **transactionally**; **archive** hides
      the trip from active lists without deleting (PRD §5.1, §7.7).
- [x] On trip creation, an **owner `TripMembership(role = Owner)`** row is created in the same
      transaction (full lifecycle in Milestone 08) (PRD §9).
- [x] Unit + integration tests cover create/edit/archive/delete and the owner-membership creation
      (PRD §7.6).

## Implementation Details / Architecture

- Lives in the **`trip` module** (PRD §7.1) with the `trip.*` schema (PRD §7.7).
- `destinations` is stored to support multi-destination trips; `cover` references a Cloud Storage
  object (bucket from M01.4) or an external URL — covers should be sized sensibly (the 1 GB/trip cap
  in Milestone 06 governs photos, not covers).
- The `Owner` `TripMembership` row is written here; Milestone 08 owns the rest of the membership
  lifecycle and reads. Day generation (Epic 02) hooks into create/edit; authorization (Epic 04)
  guards every operation.

## Dependencies

- **Upstream:** M01.3 (DB, migrations), Milestone 02 (authenticated user as `owner_id`).
- **Downstream:** Epic 02 (days), Epic 03 (listing), Epic 04 (authz), Epic 05 (UI); Milestones 04–07
  operate within a trip.

## Costs Impact

Negligible — trips are small relational rows in the existing Neon database (PRD §8, free tier).
Uploaded covers use the Cloud Storage bucket (minor).

## Designs

Trip create/edit form and trip card surfaces:
[assets/01-trips-dashboard.svg](../../../assets/01-trips-dashboard.svg) (PRD §4.1). Rendered by
Epic 05 with Milestone 09 components.

## User stories

The epic is split into **5 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-trip-schema-migration.md) | `trip.*` schema & `Trip` migration | ~3h | AC1 | — (M01.3, M02) |
| [S2](S2-trip-create-owner-membership.md) | Trip create + owner membership (transaction) | ~3.5h | AC2, AC4 | S1 |
| [S3](S3-trip-edit.md) | Trip edit (emits date-range change) | ~2.5h | AC2 | S1, S2 |
| [S4](S4-archive-delete-cascade.md) | Archive & delete (cascade, transactional) | ~3h | AC3 | S1, S2 (Epic 02) |
| [S5](S5-crud-tests.md) | Trip CRUD & owner-membership tests | ~3h | AC5 | S1–S4 (M01.3 S7) |

**Total:** ~15h (≈ 2–3 dev-days), consistent with the epic's ~2–3 dev-day estimate.

### Sequencing

```
S1 Schema ── S2 Create + owner membership ──┬─ S3 Edit ──────────────────┐
                                            └─ S4 Archive & delete ───────┴─ S5 Tests
```
