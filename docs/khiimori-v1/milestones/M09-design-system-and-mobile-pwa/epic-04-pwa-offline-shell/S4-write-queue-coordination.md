# S4 — Service worker coordinates the offline write queue

## Context
The service worker **coordinates the offline write queue** used by Milestones 04 (Planning) and 06
(Journal) — **one** mechanism, not three (PRD §6, §7.0). This epic integrates the queue into the PWA
shell; it does not redefine the queue (Milestone 04 owns the semantics).

## Task
Integrate Milestone 04's offline write queue with the service worker / PWA lifecycle.

## Acceptance criteria
- [ ] The service worker (or app lifecycle it drives) **registers/serves** Milestone 04's write queue and
  **triggers replay on reconnect** using the agreed queue contract (Milestone 04 S4).
- [ ] Planning (Milestone 04) and Journal (Milestone 06) offline writes use this **single** coordinated
  mechanism — no second queue.
- [ ] Reconnect detection reliably triggers replay; the queue drains and data reconciles.
- [ ] The integration is documented so Milestones 04/06 plug in against a stable contract.

## Constraints
- **Do not redefine** the queue/replay semantics — reuse Milestone 04's contract verbatim (PRD §7.0).
- One offline mechanism across Planning, Journal, and the PWA shell.

## Definition of done
The PWA's service worker coordinates the single offline write queue; planning/journal offline writes
replay on reconnect through it.

## Dependencies
S2 (service worker), Milestone 04 Epic 06 (queue contract), Milestone 06 Epic 04 (journal offline).
