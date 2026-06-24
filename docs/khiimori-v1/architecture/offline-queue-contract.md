# Offline Queue / Replay Contract

> **Status:** ✅ Stable — established in M04.6 S1–S3. Milestone 06 (Journal) and Milestone 09
> (service worker) MUST reuse this mechanism verbatim (PRD §7.0).

## Purpose

One shared offline path for every write in the app. Instead of building separate offline
queues for planning, journal, and future features, all mutations flow through this single
queue → replay → conflict-resolve pipeline.

---

## Queue record format

Every queued mutation is a `QueuedMutation` (defined in `web/src/lib/mutationQueue.ts`):

```ts
interface QueuedMutation {
  id: string         // client-generated UUID — stable idempotency key for the server
  seq: number        // monotonically increasing across browser restarts; replay order
  kind: MutationKind // discriminant that tells the replay engine which API to call
  payload: unknown   // mutation-specific data; interpreted by kind in the dispatcher
  enqueuedAt: string // ISO-8601 timestamp; used for LWW conflict resolution
}
```

### Key invariants

| Field | Invariant |
|-------|-----------|
| `id` | Never reused; never assigned by the server. Use `crypto.randomUUID()`. |
| `seq` | Monotonically increasing. The queue seeds from the existing max on startup. |
| `kind` | Must be registered in both `MutationKind` (mutationQueue.ts) and the dispatcher switch (replayQueue.ts). |
| `payload` | Must carry all fields the dispatcher needs — no references to in-memory state. |

---

## Extending for a new feature domain (e.g. Milestone 06 Journal)

1. **Extend `MutationKind`** in `mutationQueue.ts`:

   ```ts
   export type MutationKind =
     | 'createPlanItem'
     | ...existing kinds...
     | 'createJournalEntry'   // ← add here
     | 'updateJournalEntry'
   ```

2. **Add payload interfaces** in `replayQueue.ts` (private to the module):

   ```ts
   interface CreateJournalEntryPayload {
     tripId: string
     dayId: string
     entryId: string   // client-generated UUID — idempotency key
     body: string
   }
   ```

3. **Add `case` branches** to the `dispatch` switch in `replayQueue.ts`:

   ```ts
   case 'createJournalEntry': {
     const { tripId, dayId, entryId, body } = p as CreateJournalEntryPayload
     await api.createJournalEntry(tripId, dayId, entryId, body)
     return
   }
   ```

4. **Register dedup keys** in `conflictResolution.ts` (`resourceKey` function):

   ```ts
   case 'updateJournalEntry':
     return `updateJournalEntry:${String(p.tripId)}:${String(p.entryId)}`
   ```

   Omit from `resourceKey` (return `null`) for kinds that should never be deduplicated
   (e.g. creates with unique client IDs).

5. **Write a test** covering `enqueue → replayQueue` for the new kind, following the
   pattern in `web/src/lib/replayQueue.test.ts` ("all mutation kinds" describe block).

No other files need to change. The IndexedDB store, seq counter, and conflict-resolution
loop are generic and require zero modification.

---

## Replay behaviour

`replayQueue()` (in `replayQueue.ts`) runs on every reconnect:

1. **Read** all pending mutations from IDB, sorted by `seq` (ascending).
2. **Resolve conflicts** via `resolveConflicts()` (see below) — superseded mutations are
   deleted from IDB immediately.
3. **Dispatch** each surviving mutation in seq order by calling the matching API function.
4. **On success** or **permanent failure** (4xx): remove from IDB.
5. **On transient failure** (5xx / network error): leave in IDB — the next reconnect retries.
6. If any transient failures occurred, throw `ReplayError` (the caller decides whether to
   surface a toast, etc.).

`startReplayOnReconnect()` wires this to the browser `online` event. Call it once at app
start; `stopReplayOnReconnect()` tears it down (useful in tests).

### Error classification

| Outcome | Condition | Queue action |
|---------|-----------|--------------|
| `success` | API returned 2xx | Removed from IDB |
| `permanent_failure` | 4xx (incl. 401) | Removed from IDB |
| `transient_failure` | 5xx or network error | Left in IDB for retry |

---

## Conflict-resolution strategy

`resolveConflicts()` (in `conflictResolution.ts`) implements **Last-Write-Wins (LWW) by
seq** before dispatch:

- Multiple mutations targeting the **same resource** (same item id, same day id for
  reorders, etc.) collapse to the one with the **highest seq** — the user's most recent
  intent.
- **`createPlanItem`** (and future creates with unique client IDs) are **never
  deduplicated** — each is a distinct resource.
- The relative seq order of surviving mutations is preserved.

This strategy is deterministic and requires no CRDT library. It works correctly for
Journal because the dedup key is scoped by `kind`, so a `createJournalEntry` and a
`createPlanItem` never interfere.

### Adding a new kind to conflict resolution

- **Should deduplicate** (e.g. update, status, move): add a `case` to `resourceKey`
  returning a string keyed on the logical resource identifier.
- **Should not deduplicate** (e.g. create with unique id): return `null` from `resourceKey`
  (or rely on the `default: return null` fallback).

---

## Test coverage (CI-enforced, no live network)

All tests run against `fake-indexeddb` (in-process IDB) and `vi.fn()` mocked `fetch`.

| File | Coverage |
|------|----------|
| `mutationQueue.test.ts` | enqueue, getAll, remove, clearQueue, seq continuity, generic payload |
| `replayQueue.test.ts` | ordered replay, idempotent replay, permanent/transient failure, all kinds, conflict resolution integration |
| `conflictResolution.test.ts` | LWW dedup for every kind, reorder convergence, mixed queue, seq order preservation |

---

## Consumed by

| Milestone | Epic | Usage |
|-----------|------|-------|
| M04 | Epic 06 | Planning mutations (established here) |
| M06 | Epic 04 (Journal offline) | Journal mutations — extend `MutationKind` + dispatcher |
| M09 | Epic 04 (service worker) | SW intercepts fetch; replay hook moves from `online` event to SW message |
| M10 | E2E sync | Full offline → online sync exercised end-to-end |
