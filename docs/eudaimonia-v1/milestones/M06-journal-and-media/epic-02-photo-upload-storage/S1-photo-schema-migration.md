# S1 — `Photo` schema & migration

## Context
Photos attach to a journal entry; each has a storage URL and optional caption (PRD §9). This story adds
the table; storage and upload are S2–S3.

## Task
Add a migration for the `Photo` table in the `journal.*` schema.

## Acceptance criteria
- [ ] A migration creates `Photo(id, journal_entry_id, storage_url, caption)` with a FK to
  `journal.JournalEntry` and an index on `journal_entry_id`.
- [ ] `caption` is optional; `storage_url` references the stored object.
- [ ] The migration applies cleanly via the M01.3 runner.

## Constraints
- Follow M01.3 conventions.
- Storage-size accounting for the per-trip quota (Epic 03) will need byte sizes — include a size field if
  it simplifies quota tracking (document the choice).

## Definition of done
The `journal.Photo` table exists; migration applies cleanly.

## Dependencies
Epic 01 (JournalEntry). Consumed by S2–S3 and Epic 03 (quota/thumbnails).
