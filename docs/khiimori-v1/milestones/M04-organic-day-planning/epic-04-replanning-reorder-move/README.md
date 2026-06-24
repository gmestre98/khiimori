# Epic M04.4 — Re-planning: reorder, move-between-days, statuses

> Milestone: [04 — Organic Day Planning](../README.md) · PRD refs: §5.3, §9.

## Description

Make **re-planning first-class**. Within a day, items can be **reordered** (drag or equivalent),
updating their `order`. An item can be **moved to another day** (drag or a "move to day" action),
changing its `day_id`. And items can be marked **done / skipped / cancelled** so the day reflects
reality rather than just the plan. This epic owns the mutation semantics; the gestures/affordances
are rendered in Epic 05 and replayed offline by Epic 06.

**Estimated effort:** ~2 developer-days (one developer).

## Acceptance Criteria

- [x] **Reorder** items within a day updates their `order`, keeping the loose/timed mix stable
      (PRD §5.3).
- [x] **Move an item to another day** changes its `day_id` (via drag or a "move to day" action) and
      places it sensibly in the target day's order — reusing the same row (PRD §5.3).
- [ ] Items can be marked **`done`, `skipped`, or `cancelled`** (transitions over the
      `idea | planned | done | skipped | cancelled` set) so the day records what happened (PRD §9).
- [ ] Reorder, move, and status changes are **idempotent/queueable** for offline replay; unit +
      integration tests cover reorder, move-between-days, and status transitions (PRD §7.6, §6).

## Implementation Details / Architecture

- Operates on `PlanItem` from Epic 02 in the **`trip` module** (PRD §7.1).
- **Move and promote/demote share mechanics** (both change `day_id` and target-day `order`) — this
  epic and Epic 03 use one consistent ordering approach rather than two.
- Status transitions drive the done/skipped/cancelled rendering in Epic 05; the model permits any
  transition (no rigid state machine in v1 — keep it simple, PRD §7.0).
- Ordering uses a stable scheme robust to concurrent/offline edits (e.g. fractional/explicit `order`
  values) so replayed reorders converge.

## Dependencies

- **Upstream:** Epic 02 (PlanItem), Epic 03 (shared `day_id`/`order` semantics).
- **Downstream:** Epic 05 (drag/move/status UI), Epic 06 (offline replay), Milestone 05 (status may
  affect how costs are surfaced, but roll-up math is Milestone 05's).

## Costs Impact

Negligible — small relational row updates in the existing Neon database (PRD §8, free tier).

## Designs

Quick re-planning interactions:
[assets/03-mobile-and-sharing.svg](../../../assets/03-mobile-and-sharing.svg) (PRD §4.3) and the day
plan in [assets/02-day-plan-map.svg](../../../assets/02-day-plan-map.svg) (PRD §4.2).

## User stories

The epic is split into **4 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-ordering-reorder.md) | Ordering scheme & reorder within a day | ~3h | AC1 | Epic 02, Epic 03 |
| [S2](S2-move-between-days.md) | Move item to another day | ~3h | AC2 | S1, Epic 03 |
| [S3](S3-status-transitions.md) | Status transitions (done/skipped/cancelled) | ~2.5h | AC3 | Epic 02 |
| [S4](S4-replanning-tests.md) | Re-planning tests (reorder / move / status) | ~3h | AC4 | S1–S3 |

**Total:** ~11.5h (≈ 2 dev-days), consistent with the epic's ~2 dev-day estimate.

### Sequencing

```
S1 Ordering & reorder ── S2 Move between days ──┐
S3 Status transitions ──────────────────────────┴─ S4 Re-planning tests
```
