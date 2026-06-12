# S1 — `journal.*` schema & `JournalEntry` migration

## Context
Milestone 06 introduces journaling. Per schema-per-module (PRD §7.7), the `journal` module owns the
**`journal.*`** schema. `JournalEntry` (PRD §9) is one entry per day with optional rating/weather/mood and
an `author_id`.

## Task
Add a migration creating the `journal` schema and the `JournalEntry` table.

## Acceptance criteria
- [ ] A migration creates the **`journal`** schema and `JournalEntry(id, day_id, author_id, body, rating,
  weather, mood, created_at)` with FKs to `trip.Day` and `auth.User`.
- [ ] A uniqueness guard enforces **one entry per day** (`day_id` unique).
- [ ] `body` may be a **JSONB** column for rich content; rating/weather/mood are optional.
- [ ] The migration applies cleanly via the M01.3 runner.

## Constraints
- Follow M01.3 conventions.
- `author_id` records the writer (supports shared-trip companions journaling).

## Definition of done
The `journal.JournalEntry` table exists with one-per-day and author tracking; migration applies cleanly.

## Dependencies
M03 Epic 02 (Day), Milestone 02 (User). Consumed by S2–S3, Epic 02 (photos).
