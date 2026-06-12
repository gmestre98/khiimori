# Epic M05.2 — Cost entries & roll-up engine

> Milestone: [05 — Budgets & Cost Tracking](../README.md) · PRD refs: §5.4, §7.1, §7.7, §9.

## Description

The heart of the milestone. Add **manual cost entries** (a quick `CostEntry`: category, amount,
note, optional link to a day and/or plan item) and the **roll-up engine** that computes **actual
spend** per category/day/trip as the **consistent, transactional** sum of three sources:
`Stay.cost`, `PlanItem.cost` (read from Milestone 04 through the Trip module interface), and
`CostEntry.amount`. Editing or deleting any stay, plan item, or cost entry updates the relevant
roll-ups correctly.

**Estimated effort:** ~2–3 developer-days (one developer).

## Acceptance Criteria

- [ ] A migration adds `CostEntry(id, trip_id, day_id?, plan_item_id?, category, amount, note,
      created_at)` per PRD §9 (PRD §7.7).
- [ ] **Manual cost entries** can be created/edited/deleted quickly (category, amount, note, optional
      day/plan-item link) (PRD §5.4).
- [ ] **Automatic roll-up:** actual spend per category/day/trip is the sum of `Stay.cost`,
      `PlanItem.cost` (read via the Trip module interface), **plus** `CostEntry.amount` — no manual
      re-entry of plan/stay costs (PRD §5.4).
- [ ] Roll-up math is **consistent and transactional**, and **editing/deleting** a stay, plan item,
      or cost entry **updates the relevant roll-ups correctly** (PRD §5.4, §9).
- [ ] Unit + integration tests cover multi-level aggregation, category mapping, and edit/delete
      propagation (PRD §7.6).

## Implementation Details / Architecture

- Lives in the **`budget` module** (PRD §7.1, §7.7). It **reads** `Stay`/`PlanItem` costs through
  the Trip module's interface and **does not own** those rows — the clean boundary that lets Budget
  split into its own service later (PRD §7.1).
- **Roll-up strategy:** compute via SQL aggregation over the three sources — exactly the multi-entity
  relational aggregation PRD §7.7 cites as the reason for Postgres. Cache `BudgetLine.actual_amount`
  **only if a measured need arises**; compute-on-read first (PRD §7.0).
- Category mapping: a plan item/stay/cost-entry maps to one of the five fixed categories; the mapping
  is defined and tested.

## Dependencies

- **Upstream:** Epic 01 (budget lines / categories), Milestone 04 (stay/plan-item costs to roll up),
  Milestone 03 (trips/days).
- **Downstream:** Epics 03–04 (UI consumes entries + roll-ups); Milestone 03's dashboard glance;
  Milestone 10's budget journey.

## Costs Impact

Negligible incremental infra cost — costs are small relational rows; the relational roll-ups are
part of why the PRD chose Postgres over NoSQL (PRD §7.7, §8 free tier).

## Designs

Budget figures within the day plan:
[assets/02-day-plan-map.svg](../../../assets/02-day-plan-map.svg) (PRD §4.2).
