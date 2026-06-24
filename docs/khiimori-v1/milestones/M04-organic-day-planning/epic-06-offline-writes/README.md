# Epic M04.6 — Offline-capable writes (shared queue/replay)

> Milestone: [04 — Organic Day Planning](../README.md) · PRD refs: §5.3, §6, §7.0.

## Description

Make planning **work offline** on the current trip. Mutations (add/edit stay, add/edit/move/reorder/
status plan item, promote/demote) are **queued locally** when offline and **replayed** when
connectivity returns. The queue and replay are built as **one shared mechanism, co-designed with
Milestone 06 (Journal)** so the app has a single offline path, not two (PRD §7.0 "fewest moving
parts"). Server writes are idempotent so replays are safe.

**Estimated effort:** ~2–3 developer-days (one developer).

## Acceptance Criteria

- [x] Planning mutations made **offline queue locally** and **replay automatically** when back
      online, for the **current trip** (PRD §5.3, §6).
- [x] Writes are **idempotent** (stable client-generated ids / upsert semantics) so replays don't
      duplicate or corrupt data; conflicting edits resolve deterministically (PRD §6).
- [x] The mechanism is **shared with Milestone 06** (one queue/replay design used by both Planning
      and Journal), not a planning-only implementation (PRD §7.0).
- [x] Unit + integration tests cover queue → replay, idempotent replay (no duplicates), and a basic
      conflict case (PRD §7.6).

## Implementation Details / Architecture

- Client-side queue persists pending mutations (e.g. IndexedDB) and replays them in order when the
  network returns; the **service worker** coordination is owned by Milestone 09, this epic owns the
  **write-queue semantics** (PRD §6).
- The server side relies on the **idempotent/queueable mutation shape** established in Epics 02–04
  (stable ids, upserts) — this epic does not redesign the APIs, it makes the client resilient.
- Co-design checkpoint with Milestone 06: agree the queue record format and replay contract so
  Journal reuses it verbatim.

## Dependencies

- **Upstream:** Epics 02–04 (idempotent mutation APIs), Epic 05 (UI that issues the writes).
- **Shared:** Milestone 06 (Journal offline) and Milestone 09 (service worker / PWA shell).
- **Downstream:** Milestone 10 exercises offline → online sync end-to-end.

## Costs Impact

Negligible infra cost — offline queueing adds client complexity but no server spend (PRD §8, free
tier).

## Designs

No new visual surface; offline state is surfaced subtly within Epic 05's day view (PRD §5.10).

## User stories

The epic is split into **4 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-mutation-queue.md) | Client-side mutation queue | ~3.5h | AC1 | Epics 02–05 |
| [S2](S2-replay-idempotent.md) | Replay on reconnect (ordered, idempotent) | ~3h | AC1, AC2 | S1, Epics 02–04 |
| [S3](S3-conflict-resolution.md) | Conflict resolution (deterministic) | ~3h | AC2 | S1, S2, Epic 04 S1 |
| [S4](S4-shared-contract-tests.md) | Shared-mechanism contract & tests | ~3h | AC3, AC4 | S1–S3 |

**Total:** ~12.5h (≈ 2–3 dev-days), consistent with the epic's ~2–3 dev-day estimate.

### Sequencing

```
S1 Mutation queue ── S2 Replay (idempotent) ── S3 Conflict resolution ── S4 Shared contract & tests
```

> The shared queue/replay contract (S4) is **co-designed with Milestone 06 (Journal)** and reused by
> Milestone 09's service worker — one offline mechanism, not three.
