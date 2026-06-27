# S4 — Service worker coordinates the offline write queue

## Context
The service worker **coordinates the offline write queue** used by Milestones 04 (Planning) and 06
(Journal) — **one** mechanism, not three (PRD §6, §7.0). This epic integrates the queue into the PWA
shell; it does not redefine the queue (Milestone 04 owns the semantics).

## Task
Integrate Milestone 04's offline write queue with the service worker / PWA lifecycle.

## Acceptance criteria
- [x] The app lifecycle **registers/serves** M04's write queue and **triggers replay on reconnect** via
  `writeQueueCoordination.ts` (reuses M04's `startReplayOnReconnect` verbatim + cold-start drain).
- [x] Planning (M04) and Journal (M06) offline writes use this **single** coordinated mechanism — no
  second queue (`enqueue` → `replayQueue`).
- [x] Reconnect detection reliably triggers replay; the queue drains and data reconciles. `SyncStatus`
  confirms the outcome.
- [x] Integration documented in `web/README.md` with the stable plug-in contract.

## Constraints
- **Do not redefine** the queue/replay semantics — reuse Milestone 04's contract verbatim (PRD §7.0).
- One offline mechanism across Planning, Journal, and the PWA shell.

## Definition of done
The PWA's service worker coordinates the single offline write queue; planning/journal offline writes
replay on reconnect through it.

## Dependencies
S2 (service worker), Milestone 04 Epic 06 (queue contract), Milestone 06 Epic 04 (journal offline).
