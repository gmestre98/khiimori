# S3 — Roll-up aggregation engine

## Context
**Actual spend** per category/day/trip is the consistent sum of three sources — `Stay.cost`,
`PlanItem.cost` (read from Milestone 04 via the Trip module interface), and `CostEntry.amount` (PRD §5.4,
§9). This is the multi-entity relational aggregation the PRD chose Postgres for (PRD §7.7).

## Task
Implement the roll-up engine computing actual spend at the three levels.

## Acceptance criteria
- [x] Actual spend is computed per **category**, per **day**, and per **whole trip** as the sum of
  `Stay.cost`, `PlanItem.cost`, and `CostEntry.amount`.
- [x] Plan-item/stay costs are **read through the Trip module interface** — the Budget module does not own
  those rows (clean boundary, PRD §7.1).
- [x] Each cost source is mapped to one of the five fixed categories (mapping defined and documented).
- [x] Computation is via **SQL aggregation**; `BudgetLine.actual_amount` is computed-on-read first (cache
  only if a measured need arises, PRD §7.0).
- [x] A unit test covers a mixed scenario (stays + plan items + cost entries) at all three levels.

## Constraints
- Read stay/plan-item costs via the Trip interface, not by querying `trip.*` tables directly across the
  module boundary.
- Keep it simple: no premature caching of actuals (PRD §7.0).

## Definition of done
Actual spend rolls up correctly at category/day/trip from the three sources via SQL; mixed-scenario test
green.

## Dependencies
S1, S2, Epic 01 (budget lines), Milestone 04 (stay/plan-item costs via interface). Propagation in S4.
