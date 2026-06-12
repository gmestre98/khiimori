# Epic M05.4 — Roll-up display & dashboard glance (frontend)

> Milestone: [05 — Budgets & Cost Tracking](../README.md) · PRD refs: §5.4, §5.10, §7.2.

## Description

Render the roll-ups: **spent vs. planned vs. remaining** at **three levels** — per day, per
category, and per whole trip — with a **simple progress indicator**. Also **populate the
current-trip budget glance** slot that Milestone 03 left on the trips dashboard, so the traveller
sees budget progress at a glance from the home screen.

**Estimated effort:** ~1–2 developer-days (one developer).

## Acceptance Criteria

- [ ] Roll-ups display **spent vs. planned vs. remaining** at **three levels** — **per day, per
      category, per whole trip** — each with a **simple progress indicator** (PRD §5.4).
- [ ] The trip dashboard's **current-trip budget glance** slot (from Milestone 03) is **populated**
      with live figures from Epic 02 (PRD §5.4, Milestone 03).
- [ ] Indicators update as costs/budgets change (reflecting auto-saved/offline-synced edits from
      Epic 03) without a manual refresh (PRD §5.4).
- [ ] Display is mobile-first and responsive, using restrained accent colour for bars per the minimal
      theme and Milestone 09 components when available (PRD §5.10, §7.2).

## Implementation Details / Architecture

- Part of the **`/web` React + TypeScript** app (PRD §7.2). Reads the roll-up API from Epic 02; does
  no aggregation client-side (the server is the source of truth, consistent across web/mobile).
- The dashboard glance is the slot Milestone 03 rendered as a placeholder — this epic fills it,
  honouring the clean boundary (Milestone 03 owns the slot, Milestone 05 owns the figures).
- Progress indicators degrade gracefully when a budget line isn't set (show spend without a
  planned-vs bar).

## Dependencies

- **Upstream:** Epic 02 (roll-up API), Milestone 03 (dashboard glance slot, trip/day shell), Epic 03
  (entries that drive the figures).
- **Downstream:** Milestone 10's at-a-glance budget journey verification.

## Costs Impact

Negligible — static assets served from Firebase Hosting free tier (PRD §8.1).

## Designs

Budget progress within the day plan and dashboard glance:
[assets/02-day-plan-map.svg](../../../assets/02-day-plan-map.svg) (PRD §4.2) and
[assets/01-trips-dashboard.svg](../../../assets/01-trips-dashboard.svg) (PRD §4.1).

## User stories

The epic is split into **3 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-rollup-display.md) | Roll-up display (spent / planned / remaining) | ~3.5h | AC1, AC4 | Epic 02 |
| [S2](S2-dashboard-glance.md) | Current-trip dashboard budget glance | ~2.5h | AC2 | S1, M03 Epic 05 S2 |
| [S3](S3-live-updates-graceful.md) | Live updates & graceful no-budget handling | ~2.5h | AC3 | S1, S2, M05 Epic 03 |

**Total:** ~8.5h (≈ 1–2 dev-days), consistent with the epic's ~1–2 dev-day estimate.

### Sequencing

```
S1 Roll-up display ── S2 Dashboard glance ── S3 Live updates & graceful no-budget
```
