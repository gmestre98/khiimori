-- +goose Up
-- JournalEntry (PRD §9, §5.5, §7.7) — one entry per day with a free-text body,
-- optional rating/weather/mood, and an author_id recording the writer (supports
-- shared-trip companions journaling). Owned by the journal module.
--
-- No cross-schema FKs per migrations/README: day_id and author_id reference
-- other modules by id only; orphan cleanup is handled in application code.
--
-- body is JSONB for future rich-text support; for now the application writes and
-- reads a plain {"text": "..."} envelope. rating is an integer 1–5 (optional).
-- weather and mood are free-text strings (optional).
--
-- The UNIQUE constraint on day_id is the one-entry-per-day guard (PRD §7.7).
CREATE TABLE journal.journal_entries (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    day_id     uuid        NOT NULL UNIQUE,   -- application-level ref to trip.days; UNIQUE = one entry per day
    author_id  uuid        NOT NULL,          -- application-level ref to auth.users (the writer)
    body       jsonb       NOT NULL DEFAULT '{}',
    rating     smallint    CHECK (rating BETWEEN 1 AND 5),
    weather    text,
    mood       text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Reads filter on day_id (fetch by day) and author_id (author's entries).
CREATE INDEX journal_entries_day_id_idx    ON journal.journal_entries (day_id);
CREATE INDEX journal_entries_author_id_idx ON journal.journal_entries (author_id);

-- +goose Down
DROP TABLE journal.journal_entries;
