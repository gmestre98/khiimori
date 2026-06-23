# Epic M04.1 — Stays (accommodation, multi-night spanning)

> Milestone: [04 — Organic Day Planning](../README.md) · PRD refs: §5.2, §7.7, §9.

## Description

Model **accommodation/stays** and let a traveller add/edit/remove a stay with name, location,
check-in/out, link, and cost. A **multi-night stay is entered once and shown across the nights it
covers** — it spans days via its check-in/out range rather than per-day duplication. The `cost`
field is owned here and becomes a source for Milestone 05's budget roll-ups.

**Estimated effort:** ~1–2 developer-days (one developer).

## Acceptance Criteria

- [x] A migration adds `Stay(id, trip_id, name, location, check_in, check_out, cost, link)` to the
      `trip.*` schema per PRD §9 (PRD §7.7).
- [ ] **Add / edit / remove** a stay is implemented with all fields above; only what's needed is
      required (a stay is useful with just name + dates) (PRD §5.2).
- [ ] A **multi-night stay spans multiple days without re-entry** — entered once, surfaced across
      every night in its `[check_in, check_out)` range (PRD §5.2).
- [ ] Unit + integration tests cover multi-day spanning (a stay shown on each covered day) and
      add/edit/remove (PRD §7.6).

## Implementation Details / Architecture

- Lives in the **`trip` module** alongside Milestone 03, `trip.*` schema (PRD §7.1, §7.7).
- Spanning is derived from the check-in/out range at read time (no per-night rows), so editing dates
  updates coverage without data duplication.
- `Stay.cost` is **owned by this module**; Milestone 05 **reads** it for budget roll-ups through the
  Trip module interface (clean boundary, PRD §7.1) — this epic does not compute budgets.
- Location is optional and, when present, feeds Milestone 07's map pins.

## Dependencies

- **Upstream:** Milestone 03 (trips & days), Milestone 02 (user), Milestone 01 (DB/service).
- **Downstream:** Milestone 05 (rolls up `Stay.cost`), Milestone 07 (maps `Stay.location`),
  Epic 06 (offline wraps stay writes).

## Costs Impact

Negligible — stays are small relational rows in the existing Neon database (PRD §8, free tier).

## Designs

Accommodation within the day plan:
[assets/02-day-plan-map.svg](../../../assets/02-day-plan-map.svg) (PRD §4.2).

## User stories

The epic is split into **3 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-stay-schema-migration.md) | `Stay` schema & migration | ~2.5h | AC1 | M03 Epic 01 |
| [S2](S2-stay-crud.md) | Stay CRUD | ~3h | AC2 | S1, M03 Epic 04 |
| [S3](S3-multi-night-spanning.md) | Multi-night spanning & tests | ~3h | AC3, AC4 | S1, S2 |

**Total:** ~8.5h (≈ 1–2 dev-days), consistent with the epic's ~1–2 dev-day estimate.

### Sequencing

```
S1 Stay schema ── S2 Stay CRUD ── S3 Multi-night spanning & tests
```
