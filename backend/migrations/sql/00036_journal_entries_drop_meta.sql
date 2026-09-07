-- +goose Up
-- Remove the journal entry mood/weather/rating metadata. These optional fields
-- (added in 00016) were dropped from the product: an entry now carries just its
-- free-text body and photos. Existing values are discarded.
ALTER TABLE journal.journal_entries
    DROP COLUMN rating,
    DROP COLUMN weather,
    DROP COLUMN mood;

-- +goose Down
-- Re-add the columns (data is not recoverable), matching the original 00016 shape.
ALTER TABLE journal.journal_entries
    ADD COLUMN rating  smallint CHECK (rating BETWEEN 1 AND 5),
    ADD COLUMN weather text,
    ADD COLUMN mood    text;
