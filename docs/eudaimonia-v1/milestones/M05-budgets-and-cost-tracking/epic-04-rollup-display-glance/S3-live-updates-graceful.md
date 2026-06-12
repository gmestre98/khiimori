# S3 — Live updates & graceful no-budget handling

## Context
Indicators must update as costs/budgets change (reflecting auto-saved/offline-synced edits from Epic 03)
without a manual refresh, and degrade gracefully when a budget line isn't set (PRD §5.4).

## Task
Make the roll-up display and glance update live and handle the no-budget case.

## Acceptance criteria
- [ ] After an auto-saved/offline-synced budget or cost edit (Epic 03), the roll-up display and glance
  **update without a manual refresh**.
- [ ] When a `BudgetLine` isn't set for a category/level, the UI shows **spend without a planned-vs bar**
  (graceful degradation), not an error.
- [ ] Updates remain consistent with the server source of truth (re-fetch or reconcile after sync).
- [ ] Behaviour is verified for the offline → online reconcile path.

## Constraints
- Reconcile with the server after the offline queue replays (Milestone 04) — don't show stale totals
  indefinitely.
- Keep the no-budget state informative (show actual spend) rather than blank.

## Definition of done
Roll-ups and the glance update live after edits/sync and degrade gracefully without a set budget.

## Dependencies
S1, S2, Epic 03 (auto-save/offline), Milestone 04 Epic 06 (sync).
