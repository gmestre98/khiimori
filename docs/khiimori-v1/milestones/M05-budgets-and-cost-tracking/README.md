# Milestone 05 — Budgets & Cost Tracking

> Trip- and day-level budgets per category, automatic roll-ups from stays/activities plus fast
> manual cost entries, and spent-vs-budget-vs-planned at a glance — per day, per category, and per
> whole trip. All amounts EUR.
>
> PRD refs: §5.4, §9 (BudgetLine, CostEntry), §7.1 (Budget module).
>
> **Status:** ✅ Done — all 4 epics and 17 ACs complete; budget model & lines, cost entries & roll-up engine, budget editor & fast cost entry, and roll-up display & dashboard glance are live on `main` (PRs [#279](https://github.com/gmestre98/khiimori/pull/279)–[#294](https://github.com/gmestre98/khiimori/pull/294)).

---

## Milestone goal

Let the traveller **always know where they stand**. Budgets are set per category — **Stays,
Transport, Food, Activities, Other** — at the **trip level and/or per day**. Actual spend is tracked
by **automatically rolling up** stay/activity costs (owned by Milestone 04) **plus** fast **manual
cost entries** added on the go. The UI shows **remaining vs. spent vs. planned** at a glance with a
simple progress indicator, rolled up per day, per category, and per whole trip. Logging a cost must
be as fast as adding a plan item, auto-saving and offline-capable, so the budget stays accurate
while travelling. The Budget module **reads** stay/plan-item costs through the Trip module interface
and owns the aggregation — a clean boundary that keeps the door open to splitting Budget out later.

## Milestone-level Definition of Done

- A **`planned_amount` per category** can be set at **trip level** (`day_id = null`) and/or **per
  day**, with categories fixed to **Stays, Transport, Food, Activities, Other** (PRD §5.4, §9).
- **Actual spend** is the consistent, transactional sum of related `Stay`/`PlanItem` costs **plus**
  ad-hoc `CostEntry` rows; editing/deleting any of them updates the roll-ups correctly (PRD §5.4,
  §9).
- Roll-ups display **spent vs. planned vs. remaining** at **three levels** — per day, per category,
  per whole trip — with a **simple progress indicator**, and they **populate the current-trip budget
  glance** slot from Milestone 03 (PRD §5.4).
- Cost logging is **fast, auto-saving, and offline-capable** on mobile (queuing like plan edits);
  **all amounts are EUR** with no currency selector (PRD §5.4, §6, §11.5).
- Unit + integration tests cover multi-level aggregation, category mapping, and trip-vs-day budget
  interaction (PRD §7.6).

## Epics in this milestone

| Epic | Title | AC | Est. (dev-days) | Cost-relevant |
|------|-------|----|-----------------|---------------|
| [01](epic-01-budget-model-lines/README.md) | Budget model & budget lines (`budget.*`) | 4 | ~1–2 | — |
| [02](epic-02-cost-entries-rollup-engine/README.md) | Cost entries & roll-up engine | 5 | ~2–3 | — |
| [03](epic-03-budget-ui-fast-entry/README.md) | Budget editor & fast cost entry (frontend) | 4 | ~2 | — |
| [04](epic-04-rollup-display-glance/README.md) | Roll-up display & dashboard glance (frontend) | 4 | ~1–2 | — |
| | **Milestone total** | **17** | **~6–9** (≈ 1.5–2 weeks, one developer) | — |

> **Estimates** assume one developer familiar with the stack; they cover implementation, tests, and
> review. Epic 02 (roll-up engine) is the heart of the milestone; the two frontend epics build on it.

## Sequencing within the milestone

```
01 Budget model & lines ──┬─ 02 Cost entries & roll-up engine ──┬─ 03 Budget editor & fast cost entry
                          │                                     └─ 04 Roll-up display & dashboard glance
                          └──────────────────────────────────────┘
```

## Designs

Daily budget panel within the day plan:
[assets/02-day-plan-map.svg](../../assets/02-day-plan-map.svg) (PRD §4.2). Budget bars use restrained
accent colour per the minimal theme (PRD §5.10).
