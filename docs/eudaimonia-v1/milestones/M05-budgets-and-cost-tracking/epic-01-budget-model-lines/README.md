# Epic M05.1 — Budget model & budget lines (`budget.*`)

> Milestone: [05 — Budgets & Cost Tracking](../README.md) · PRD refs: §5.4, §7.7, §9, §11.5.

## Description

Establish the `budget` module and `budget.*` schema, and let a traveller set a **`planned_amount`
per category** at **trip level** (`day_id = null`) and/or **per day**. Categories are fixed to
**Stays, Transport, Food, Activities, Other**. All amounts are EUR. This epic owns the budget
definition; the actual-spend aggregation is Epic 02.

**Estimated effort:** ~1–2 developer-days (one developer).

## Acceptance Criteria

- [ ] A migration creates the **`budget.*`** schema with
      `BudgetLine(id, trip_id, day_id?, category, planned_amount, actual_amount)` per PRD §9
      (PRD §7.7).
- [ ] A `planned_amount` can be set **per category** at **trip level** (`day_id = null`) and/or **per
      day**; categories are fixed to **Stays, Transport, Food, Activities, Other** (PRD §5.4).
- [ ] All amounts are **EUR**; there is **no currency selector** and `base_currency` stays fixed
      (PRD §5.4, §11.5).
- [ ] Unit + integration tests cover setting/updating trip-level and per-day budget lines and
      category validation (PRD §7.6).

## Implementation Details / Architecture

- Lives in the **`budget` module** with the `budget.*` schema (PRD §7.1, §7.7).
- `day_id = null` is a **trip-level** budget; otherwise it is **per day**. The fixed category set is
  enforced server-side.
- `actual_amount` is present on the row but **computed/maintained by Epic 02's roll-up engine** —
  this epic only owns `planned_amount`. Whether `actual_amount` is cached or computed on read is an
  Epic 02 decision (keep it simple first, PRD §7.0).

## Dependencies

- **Upstream:** Milestone 03 (trips/days), Milestone 02 (user), Milestone 01 (DB/service).
- **Downstream:** Epic 02 (roll-up engine fills actuals), Epics 03–04 (UI), Milestone 03's dashboard
  glance.

## Costs Impact

Negligible — budget lines are small relational rows in the existing Neon database (PRD §8, free
tier).

## Designs

Daily budget panel: [assets/02-day-plan-map.svg](../../../assets/02-day-plan-map.svg) (PRD §4.2).
