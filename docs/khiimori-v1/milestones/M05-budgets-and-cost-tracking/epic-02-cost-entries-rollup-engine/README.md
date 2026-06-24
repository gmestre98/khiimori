# Epic M05.2 — Cost entries & roll-up engine

> **Status:** ✅ Done — PRs [#283](https://github.com/gmestre98/khiimori/pull/283) [#284](https://github.com/gmestre98/khiimori/pull/284) [#285](https://github.com/gmestre98/khiimori/pull/285) [#286](https://github.com/gmestre98/khiimori/pull/286) [#287](https://github.com/gmestre98/khiimori/pull/287) — 5/5 ACs complete.

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

- [x] A migration adds `CostEntry(id, trip_id, day_id?, plan_item_id?, category, amount, note,
      created_at)` per PRD §9 (PRD §7.7).
- [x] **Manual cost entries** can be created/edited/deleted quickly (category, amount, note, optional
      day/plan-item link) (PRD §5.4).
- [x] **Automatic roll-up:** actual spend per category/day/trip is the sum of `Stay.cost`,
      `PlanItem.cost` (read via the Trip module interface), **plus** `CostEntry.amount` — no manual
      re-entry of plan/stay costs (PRD §5.4).
- [x] Roll-up math is **consistent and transactional**, and **editing/deleting** a stay, plan item,
      or cost entry **updates the relevant roll-ups correctly** (PRD §5.4, §9).
- [x] Unit + integration tests cover multi-level aggregation, category mapping, and edit/delete
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

## User stories

The epic is split into **5 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-costentry-schema.md) | `CostEntry` schema & migration | ~2.5h | AC1 | Epic 01, M03/M04 |
| [S2](S2-costentry-crud.md) | Cost entry CRUD | ~3h | AC3 | S1, M03 Epic 04 |
| [S3](S3-rollup-engine.md) | Roll-up aggregation engine | ~3.5h | AC2 | S1, S2, M04 (via interface) |
| [S4](S4-edit-delete-propagation.md) | Edit/delete propagation & transactional consistency | ~3h | AC4 | S2, S3 |
| [S5](S5-rollup-tests.md) | Roll-up & aggregation tests | ~3h | AC5 | S1–S4 |

**Total:** ~15h (≈ 2–3 dev-days), consistent with the epic's ~2–3 dev-day estimate.

### Sequencing

```
S1 CostEntry schema ── S2 CostEntry CRUD ── S3 Roll-up engine ── S4 Edit/delete propagation ── S5 Tests
```
