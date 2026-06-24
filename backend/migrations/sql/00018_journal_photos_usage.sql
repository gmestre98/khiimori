-- +goose Up
-- is_thumbnail distinguishes original uploads from thumbnail variants (Epic 03 S1/S3).
-- Only originals (is_thumbnail = FALSE) count toward the per-trip 1 GB cap;
-- thumbnail bytes are free storage provided by the platform.
ALTER TABLE journal.photos ADD COLUMN is_thumbnail BOOLEAN NOT NULL DEFAULT FALSE;

-- +goose Down
ALTER TABLE journal.photos DROP COLUMN is_thumbnail;
