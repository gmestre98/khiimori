# Epic M05.3 — Budget editor & fast cost entry (frontend)

> Milestone: [05 — Budgets & Cost Tracking](../README.md) · PRD refs: §5.4, §6, §5.10, §7.2.

## Description

Build the **budget editor** (set planned amounts per trip / per day / per category) and a **fast
"add cost" affordance** reachable from the day view — logging a cost must be roughly the same effort
as adding a plan item. Cost logging **auto-saves** and is **offline-capable**, queuing like plan
edits via the shared offline mechanism. All amounts are EUR.

**Estimated effort:** ~2 developer-days (one developer).

## Acceptance Criteria

- [ ] A **budget editor** sets `planned_amount` per **trip / per day / per category** (the five fixed
      categories), driving Epic 01 (PRD §5.4).
- [ ] A **fast "add cost"** affordance reachable from the day view creates a `CostEntry` in roughly
      the effort of adding a plan item (category, amount, note, optional day/plan-item link)
      (PRD §5.4).
- [ ] Cost logging **auto-saves** (no explicit save) and is **offline-capable**, queuing via the
      shared offline mechanism from Milestone 04 (PRD §5.4, §6).
- [ ] Amounts display and accept **EUR only** (no currency selector); the UI is mobile-first and
      responsive, using Milestone 09 components when available (PRD §5.10, §11.5).

## Implementation Details / Architecture

- Part of the **`/web` React + TypeScript** app (PRD §7.2), rendered within Milestone 03's trip/day
  shell and Milestone 04's day view.
- Reuses the **offline write queue** from Milestone 04 so a logged cost behaves identically online
  and offline (one mechanism, PRD §7.0).
- The fast-cost affordance lives next to the day's plan list so spontaneous spends are captured in a
  tap or two (PRD §5.4 "fast in-trip use").

## Dependencies

- **Upstream:** Epics 01–02 (budget lines, cost entries, roll-up API), Milestone 04 (day view +
  offline queue), Milestone 03 (trip/day shell).
- **Downstream:** Epic 04 renders the roll-ups these entries feed; Milestone 10's budget journey.

## Costs Impact

Negligible — static assets served from Firebase Hosting free tier (PRD §8.1).

## Designs

Daily budget panel and add-cost affordance:
[assets/02-day-plan-map.svg](../../../assets/02-day-plan-map.svg) (PRD §4.2). Budget bars use
restrained accent colour (PRD §5.10).

## User stories

The epic is split into **3 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-budget-editor.md) | Budget editor (trip / day / category) | ~3h | AC1, AC4 | M03 Epic 05, Epic 01 |
| [S2](S2-fast-add-cost.md) | Fast "add cost" affordance | ~3h | AC2, AC4 | M04 Epic 05, Epic 02 |
| [S3](S3-autosave-offline.md) | Auto-save & offline queue integration | ~2.5h | AC3 | S1, S2, M04 Epic 06 |

**Total:** ~8.5h (≈ 1–2 dev-days). Slightly under the epic's ~2 dev-day estimate to leave headroom for design polish.

### Sequencing

```
S1 Budget editor ──┬─ S3 Auto-save & offline
S2 Fast add cost ──┘
```
