# Milestone 05 — Budgets & Cost Tracking

**Status:** Milestone overview — to be split into focused epics (≤5 acceptance criteria each) following the [Milestone 01](../M01-foundations/README.md) pattern. The criteria below are the milestone-level spec and the source material for that split.

> Trip- and day-level budgets per category, automatic roll-ups from stays/activities, fast manual
> cost entries, and spent-vs-budget-vs-planned at a glance.
>
> PRD refs: §5.4, §9 (BudgetLine, CostEntry), §7.1 (Budget module).

---

## Description

Let the traveller **always know where they stand**. Budgets are set per category — **Stays,
Transport, Food, Activities, Other** — at the **trip level and/or per day**. Actual spend is
tracked by **automatically rolling up** stay/activity costs **plus** fast **manual cost entries**
added on the go (e.g. a spontaneous lunch). The UI shows **remaining vs. spent vs. planned** at a
glance with a simple progress indicator, rolled up **per day, per category, and per whole trip**.
Logging a cost must be as fast as adding a plan item, so the budget stays accurate while
travelling. **All amounts are EUR** in v1.

## Acceptance Criteria

- [ ] Set a **`planned_amount` per category** at **trip level** (`day_id = null`) and/or **per
      day** (PRD §5.4, §9). Categories fixed to: **Stays, Transport, Food, Activities, Other**.
- [ ] **Automatic roll-up:** costs on `Stay` and `PlanItem` (from Epic 04) contribute to actual
      spend in their category without manual re-entry (PRD §5.4).
- [ ] **Manual cost entries:** add a quick `CostEntry` (category, amount, note, optional link to a
      day and/or plan item) in roughly the same effort as adding a plan item (PRD §5.4).
- [ ] **Roll-ups** display **spent vs. planned vs. remaining** at **three levels** — per day, per
      category, and per whole trip — with a **simple progress indicator** (PRD §5.4).
- [ ] The trip dashboard's **current-trip budget glance** (slot from Epic 03) is populated here.
- [ ] **All amounts are EUR**; no currency selector (PRD §5.4, §9, §11.5).
- [ ] Roll-up math is **consistent and transactional** — actual = sum of related `Stay`/`PlanItem`
      costs **plus** ad-hoc `CostEntry` rows, tracked against `BudgetLine` (PRD §9 notes).
- [ ] Cost logging **auto-saves** and is **offline-capable** on mobile, queuing like plan edits
      (PRD §5.4 "fast in-trip use", §6).
- [ ] Editing/deleting a stay, plan item, or cost entry updates the relevant roll-ups correctly.
- [ ] Unit + integration tests for multi-level aggregation, category mapping, and trip-vs-day
      budget interaction (PRD §7.6).

## Implementation Details / Architecture

- Lives in the **`budget` module** (PRD §7.1) with the `budget.*` schema (PRD §7.7).
- Entities (PRD §9):
  - `BudgetLine(id, trip_id, day_id?, category, planned_amount, actual_amount)` — `day_id = null`
    is a trip-level budget; per-day otherwise.
  - `CostEntry(id, trip_id, day_id?, plan_item_id?, category, amount, note, created_at)`.
- **Roll-up strategy:** actual spend per category/day/trip is computed from three sources —
  `Stay.cost`, `PlanItem.cost`, and `CostEntry.amount`. Because these are **relational sums and
  joins**, this is exactly the multi-entity aggregation PRD §7.7 cites as the reason for Postgres.
  Compute via SQL aggregation; cache `actual_amount` only if a measured need arises (keep it
  simple first — PRD §7.0).
- **Module boundary (PRD §7.1):** the Budget module **reads** stay/plan-item costs owned by the
  Trip module through its interface; it does not own those rows. This keeps the door open to split
  Budget into its own service later without a data redesign.
- **Currency:** all money in EUR; `base_currency` retained but fixed (PRD §9, §11.5).
- Frontend: budget editor (per trip/day/category), a fast "add cost" affordance reachable from the
  day view, and progress indicators (Epic 09 components, accent colour for bars per PRD §5.10).

## Dependencies

- **Upstream:** Epic 03 (trips/days), Epic 04 (stay/plan-item costs to roll up), Epic 02 (user),
  Epic 01 (DB/service).
- **Shared:** offline write queue (with Epics 04 and 06).
- **Downstream:** feeds the trip dashboard glance (Epic 03) and contributes to e2e budget journey
  (Epic 10).

## Costs Impact

Negligible incremental infra cost — budgets/costs are small relational rows in the existing Neon
DB (PRD §8, free tier). No new billable component; the relational roll-ups are part of why the
PRD chose Postgres over NoSQL (PRD §7.7).

## Designs

Daily budget panel within the day plan:
[assets/02-day-plan-map.svg](../assets/02-day-plan-map.svg) (PRD §4.2). Budget bars use restrained
accent colour per the minimal theme (PRD §5.10).
