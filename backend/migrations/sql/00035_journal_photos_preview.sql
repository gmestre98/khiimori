-- +goose Up
-- preview stores a tiny (~24px) blurred JPEG encoded as a base64 data URI. It is
-- delivered inline with the photo JSON (no signed URL, no second request) so grid
-- tiles can show an instant blur-up placeholder while the real thumbnail loads.
-- NULL until preview generation succeeds; backfilled from the thumbnail on startup
-- for photos uploaded before this column existed.
ALTER TABLE journal.photos ADD COLUMN preview text;

-- +goose Down
ALTER TABLE journal.photos DROP COLUMN preview;
