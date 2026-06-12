# S2 — Replay on reconnect (ordered, idempotent)

## Context
Queued mutations must **replay automatically when back online**, without duplicating or corrupting data —
relying on the **idempotent/queueable** mutation shape (stable ids / upserts) from Epics 02–04 (PRD §6).

## Task
Implement ordered, idempotent replay of the mutation queue when connectivity returns.

## Acceptance criteria
- [ ] On reconnect, queued mutations replay **in order** to the server.
- [ ] Replay is **idempotent**: re-sending a mutation (stable id / upsert) does not duplicate or corrupt
  data.
- [ ] Successfully applied mutations are removed from the queue; failures are retried or surfaced.
- [ ] The current-trip data reconciles to the server state after replay.

## Constraints
- Rely on the server's idempotent mutation APIs (Epics 02–04) — do not invent server changes here.
- Detect connectivity changes reliably (coordinate with Milestone 09's service worker when it lands).

## Definition of done
Offline planning changes replay in order on reconnect with no duplication; the queue drains correctly.

## Dependencies
S1 (queue), Epics 02–04 (idempotent APIs). Conflict handling in S3.
