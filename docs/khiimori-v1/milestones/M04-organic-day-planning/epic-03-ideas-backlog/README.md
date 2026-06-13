# Epic M04.3 — Ideas backlog & promote/demote

> Milestone: [04 — Organic Day Planning](../README.md) · PRD refs: §5.2, §5.3, §9.

## Description

Provide the **parking lot** of unscheduled ideas — a `PlanItem` with `day_id = null` at trip (and/or
day) level. A traveller can **promote an idea to a day** by setting its `day_id` (and optionally a
`start_time`) and **demote it back** to the backlog, all **without re-entering** the item: the same
row moves between backlog and day.

**Estimated effort:** ~1–2 developer-days (one developer).

## Acceptance Criteria

- [ ] A **backlog** of ideas exists at trip (and/or day) level, represented as `PlanItem`s with
      `day_id = null` (PRD §5.2, §9).
- [ ] **Promote** sets a backlog item's `day_id` (and optionally `start_time`); **demote** clears
      `day_id` back to the backlog — both **reuse the same row** (no re-entry) (PRD §5.3).
- [ ] Promote/demote preserve the item's other fields (title, cost, link, etc.) and place it sensibly
      in the target day's `order` (PRD §5.3).
- [ ] Unit + integration tests cover promote, demote, and field/`order` preservation (PRD §7.6).

## Implementation Details / Architecture

- Operates on the `PlanItem` entity from Epic 02 in the **`trip` module** (PRD §7.1).
- Promote/demote are pure `day_id` (and optional `start_time`) changes — the no-re-entry guarantee
  the PRD calls out (PRD §5.3) — kept idempotent so Epic 06's offline queue can replay them.
- On promote, the item joins the target day's ordered list (Epic 04 owns the reorder mechanics);
  this epic ensures a reasonable initial position.

## Dependencies

- **Upstream:** Epic 02 (PlanItem model).
- **Downstream:** Epic 04 (reorder/move share the same `order`/`day_id` mechanics), Epic 05 (backlog
  + day surfaces render this), Epic 06 (offline replay).

## Costs Impact

Negligible — small relational row updates in the existing Neon database (PRD §8, free tier).

## Designs

Ideas/backlog and day list:
[assets/02-day-plan-map.svg](../../../assets/02-day-plan-map.svg) and the mobile quick-add context in
[assets/03-mobile-and-sharing.svg](../../../assets/03-mobile-and-sharing.svg) (PRD §4.2–4.3).

## User stories

The epic is split into **3 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-backlog-read.md) | Ideas backlog list (`day_id = null`) | ~2.5h | AC1 | Epic 02, M03 Epic 04 |
| [S2](S2-promote-demote.md) | Promote & demote (no re-entry) | ~3h | AC2 | S1, Epic 02 |
| [S3](S3-preservation-tests.md) | Field/order preservation & tests | ~2.5h | AC3, AC4 | S1, S2 |

**Total:** ~8h (≈ 1–2 dev-days), consistent with the epic's ~1–2 dev-day estimate.

### Sequencing

```
S1 Backlog read ── S2 Promote/demote ── S3 Preservation & tests
```
