# Epic M04.2 — Plan items model & CRUD (timed & untimed)

> Milestone: [04 — Organic Day Planning](../README.md) · PRD refs: §5.2, §7.7, §9.

## Description

Model the **plan item** — the flexible unit of a day's itinerary (activity, tour, idea, transport).
Creating one requires **only a title**; type, time, duration, location, booking status, link, and
cost are all optional. An item is **untimed** when `start_time` is null (a loose idea/maybe) or
**timed** when a start time (and optional duration) is set. This epic owns the entity, its `status`
set, and CRUD; the day-view rendering is Epic 05 and re-planning operations are Epics 03–04.

**Estimated effort:** ~2 developer-days (one developer).

## Acceptance Criteria

- [ ] A migration adds `PlanItem(id, trip_id, day_id?, title, type, start_time?, duration?,
      location?, booking_status?, cost?, link?, order, status)` to `trip.*` per PRD §9 (PRD §7.7).
- [ ] **Create** requires **only `title`**; all other fields are optional and independently editable
      (PRD §5.2).
- [ ] An item is **untimed** when `start_time` is null and **timed** when a start time (+ optional
      duration) is set — both are first-class, never forcing a time where there isn't one (PRD §5.2).
- [ ] `status` is one of `idea | planned | done | skipped | cancelled`, defaulting sensibly on
      create; `cost` is owned here for Milestone 05's roll-ups (PRD §9).
- [ ] Unit + integration tests cover create-with-title-only, timed/untimed toggling, and full CRUD
      (PRD §7.6).

## Implementation Details / Architecture

- Lives in the **`trip` module**, `trip.*` schema (PRD §7.1, §7.7).
- **Semantics (PRD §9):** `day_id = null` → backlog idea (Epic 03); `start_time = null` → untimed.
  `order` gives a stable within-day sequence for the loose/timed mix (used by Epic 04).
- `PlanItem.cost` is **owned here**; Milestone 05 reads it for roll-ups (clean boundary, PRD §7.1).
  `location`, when present, feeds Milestone 07's map pins.
- Mutations are designed to be **queueable and idempotent** (stable ids / upsert semantics) so
  Epic 06's offline layer can replay them.

## Dependencies

- **Upstream:** Milestone 03 (trips & days), Milestone 02 (user), Milestone 01 (DB/service).
- **Downstream:** Epic 03 (backlog promote/demote), Epic 04 (reorder/move/status), Epic 05 (day
  view), Epic 06 (offline), Milestone 05 (cost roll-up), Milestone 07 (location pins).

## Costs Impact

Negligible — plan items are small relational rows in the existing Neon database (PRD §8, free tier).

## Designs

Activities within the day plan:
[assets/02-day-plan-map.svg](../../../assets/02-day-plan-map.svg) (PRD §4.2).

## User stories

The epic is split into **4 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-planitem-schema-migration.md) | `PlanItem` schema & migration | ~3h | AC1, AC4 | M03 Epics 01/02 |
| [S2](S2-create-timed-untimed.md) | Create plan item (title-only) & timed/untimed | ~3h | AC2, AC3 | S1, M03 Epic 04 |
| [S3](S3-edit-delete.md) | Edit & delete plan items | ~2.5h | AC2 | S1, S2 |
| [S4](S4-planitem-tests.md) | Plan-item CRUD & timed/untimed tests | ~3h | AC5 | S1–S3 |

**Total:** ~11.5h (≈ 2 dev-days), consistent with the epic's ~2 dev-day estimate.

### Sequencing

```
S1 Schema ── S2 Create (title-only, timed/untimed) ── S3 Edit & delete ── S4 Tests
```
