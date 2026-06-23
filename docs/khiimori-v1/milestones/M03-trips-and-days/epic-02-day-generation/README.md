# Epic M03.2 — Automatic day generation on range edits

> Milestone: [03 — Trips & Days](../README.md) · PRD refs: §5.1, §7.7, §9.

## Description

Derive the trip's **days** from its date range. On create — and on any date-range edit — the trip
**auto-generates exactly one `Day` per date** in `[start_date, end_date]`, each with an `index` and
`date`. Shrinking the range removes now-out-of-range days (with a guard/confirm if they hold data);
extending the range adds new ones. Days map to **real calendar dates** and are **deep-linkable** so
Planning, Journal, and Maps can address a specific day.

**Estimated effort:** ~2 developer-days (one developer).

## Acceptance Criteria

- [ ] A migration creates `Day(id, trip_id, date, index, notes)` per PRD §9 (PRD §7.7).
- [ ] On create or date-range change, exactly **one `Day` per date** in `[start_date, end_date]`
      exists, each with a stable `index` and real `date`; the operation is **transactional**
      (PRD §5.1, §7.7).
- [ ] **Shrinking** the range removes out-of-range days **with a guard/confirm if they hold data**;
      **extending** adds new days without disturbing existing ones (PRD §5.1).
- [x] Each `Day` is **addressable for deep-linking** (e.g. trip → day) to support Planning/Journal/
      Maps; unit + integration tests cover generation on range edits including single-day and
      shrink-with-data cases (PRD §7.6).

## Implementation Details / Architecture

- Lives in the **`trip` module** (PRD §7.1), invoked by Epic 01's create/edit paths.
- `index` gives a stable within-trip order; days still map to real calendar dates (reordering is
  conceptual, not date-detaching) (PRD §5.1).
- The shrink-with-data guard protects against silently destroying plan items/journal entries that
  later milestones attach to a day; the exact UX (warn/confirm vs. block) is surfaced to the client.

## Dependencies

- **Upstream:** Epic 01 (Trip model & create/edit hooks).
- **Downstream:** Milestones 04 (plan items per day), 05 (per-day budgets), 06 (journal per day),
  07 (per-day map) all key off `Day`.

## Costs Impact

Negligible — days are small relational rows in the existing Neon database (PRD §8, free tier).

## Designs

Day-within-trip context: [assets/02-day-plan-map.svg](../../../assets/02-day-plan-map.svg)
(PRD §4.2). No bespoke UI in this epic beyond the day shell rendered in Epic 05.

## User stories

The epic is split into **4 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-day-schema-migration.md) | `Day` schema & migration | ~2.5h | AC1 | Epic 01 S1 |
| [S2](S2-generate-days-on-create.md) | Generate days on trip create | ~3h | AC2 | S1, Epic 01 S2 |
| [S3](S3-regenerate-on-range-edit.md) | Regenerate days on range edit (add/remove, shrink guard) | ~3.5h | AC3 | S1, S2, Epic 01 S3 |
| [S4](S4-day-addressability-tests.md) | Day addressability & generation tests | ~3h | AC4 | S1–S3 (M01.3 S7) |

**Total:** ~12h (≈ 2 dev-days), consistent with the epic's ~2 dev-day estimate.

### Sequencing

```
S1 Day schema ── S2 Generate on create ── S3 Regenerate on range edit ── S4 Addressability & tests
```
