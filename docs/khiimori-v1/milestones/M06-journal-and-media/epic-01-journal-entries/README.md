# Epic M06.1 — Journal entries (`journal.*`, auto-save)

> **Status:** ✅ Done — PRs [#295](https://github.com/gmestre98/khiimori/pull/295) (S1), [#296](https://github.com/gmestre98/khiimori/pull/296) (S2), [#297](https://github.com/gmestre98/khiimori/pull/297) (S3). All 4 ACs verified.

> Milestone: [06 — Journal & Media](../README.md) · PRD refs: §5.5, §7.7, §9.

## Description

Establish the `journal` module and `journal.*` schema, and implement **one journal entry per day**
with a free-text body, optional rating, weather, and mood. `author_id` records who wrote the entry
(supporting shared trips where an Editor companion journals). Text **auto-saves** with no explicit
save. This epic owns the entry model and CRUD; photos are Epic 02 and the UI/offline behaviour is
Epic 04.

**Estimated effort:** ~1–2 developer-days (one developer).

## Acceptance Criteria

- [x] A migration creates the **`journal.*`** schema with
      `JournalEntry(id, day_id, author_id, body, rating, weather, mood, created_at)` per PRD §9, with
      **one entry per day** (PRD §7.7).
- [x] An entry supports a **free-text body** plus **optional** rating, weather, and mood;
      `author_id` records the writer (PRD §5.5, §9).
- [x] Entry text **auto-saves** server-side (no explicit save); the save path is **idempotent** so
      Epic 04's offline queue can replay it (PRD §5.5, §6).
- [x] Unit + integration tests cover one-entry-per-day, optional fields, and `author_id` capture
      (PRD §7.6).

## Implementation Details / Architecture

- Lives in the **`journal` module** with the `journal.*` schema (PRD §7.1, §7.7).
- `body` may use a **JSONB** column for rich content, leaning on Postgres flexibility (PRD §7.7).
- All reads/writes pass the Sharing module's server-side check (Milestone 08) so an entry is only
  visible to owner + invited members — wired through the same `Authorizer` interface used elsewhere
  (PRD §5.9, §6).
- Auto-save is debounced on the client (Epic 04); the server contract is a plain idempotent upsert.

## Dependencies

- **Upstream:** Milestone 03 (days), Milestone 02 (author identity), Milestone 01 (DB/service).
- **Downstream:** Epic 02 (photos attach to entries), Epic 04 (UI/offline), Milestone 08
  (authorization), Milestone 10 (journal journey).

## Costs Impact

Negligible — journal text is small relational rows in the existing Neon database (PRD §8, free tier).
Photos (the storage cost) are Epics 02–03.

## Designs

Mobile journal view: [assets/03-mobile-and-sharing.svg](../../../assets/03-mobile-and-sharing.svg)
(PRD §4.3).

## User stories

The epic is split into **3 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-journal-schema-migration.md) | `journal.*` schema & `JournalEntry` migration | ~2.5h | AC1 | M03 Epic 02, M02 |
| [S2](S2-entry-crud-autosave.md) | Entry CRUD & idempotent auto-save | ~3h | AC1, AC3 | S1, M02 |
| [S3](S3-authz-tests.md) | Authorization & entry tests | ~3h | AC1 | S1, S2, M03 Epic 04 |

**Total:** ~8.5h (≈ 1–2 dev-days), consistent with the epic's ~1–2 dev-day estimate.

### Sequencing

```
S1 Schema ── S2 Entry CRUD (idempotent) ── S3 Authorization & tests
```
