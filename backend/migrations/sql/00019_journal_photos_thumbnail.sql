-- +goose Up
-- thumbnail_url stores the Cloud Storage URL of the server-generated thumbnail
-- variant (Epic 03 S3). NULL until thumbnail generation succeeds; non-NULL once
-- the thumbnail is stored. List/grid reads serve this URL instead of storage_url.
ALTER TABLE journal.photos ADD COLUMN thumbnail_url text;

-- +goose Down
ALTER TABLE journal.photos DROP COLUMN thumbnail_url;
