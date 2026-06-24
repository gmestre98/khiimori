-- +goose Up
-- Photo (PRD §9, §5.5, §7.7) — photos attached to a journal entry.
-- Stored in Cloud Storage; storage_url references the object key.
--
-- No cross-schema FKs per migrations/README: journal_entry_id is an
-- application-level reference; orphan cleanup is handled in application code.
--
-- size_bytes is included now so Epic 03's per-trip quota accounting can sum
-- photo sizes without an additional storage round-trip.
--
-- caption is optional free text.
CREATE TABLE journal.photos (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id uuid        NOT NULL,           -- application-level ref to journal.journal_entries
    storage_url      text        NOT NULL,           -- Cloud Storage object URL
    caption          text,                           -- optional user-supplied caption
    size_bytes       bigint      NOT NULL DEFAULT 0, -- original file size for quota tracking (Epic 03)
    created_at       timestamptz NOT NULL DEFAULT now()
);

-- Lookups filter on journal_entry_id (fetch all photos for an entry).
CREATE INDEX journal_photos_entry_id_idx ON journal.photos (journal_entry_id);

-- +goose Down
DROP TABLE journal.photos;
