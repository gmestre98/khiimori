# S3 — Auto-save & offline queue integration

## Context
Cost logging **auto-saves** (no explicit save) and is **offline-capable**, queuing like plan edits via the
shared offline mechanism from Milestone 04 (PRD §5.4, §6).

## Task
Wire budget edits and cost entries into auto-save and the shared offline queue.

## Acceptance criteria
- [ ] Budget-line edits (S1) and cost entries (S2) **auto-save** with debouncing, no explicit save button.
- [ ] Edits made **offline queue** via Milestone 04's mutation queue and **replay** on reconnect.
- [ ] Behaviour is identical online and offline (same mutation layer); save state is surfaced subtly.
- [ ] A failed online save is retried/flagged without losing input.

## Constraints
- Reuse Milestone 04's offline queue/replay (one mechanism, PRD §7.0) — do not build a budget-specific
  queue.
- Keep `CostEntry`/budget mutations idempotent (Epic 02 S2) so replay is safe.

## Definition of done
Budget and cost edits auto-save and work offline via the shared queue, consistent with planning.

## Dependencies
S1, S2, Epic 02, Milestone 04 Epic 06 (offline queue).
