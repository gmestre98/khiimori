-- +goose Up
-- A traveller-chosen title for a day ("Gorée and the corniche"). Empty means
-- "no custom title": the app then names the day after its place, as before.
ALTER TABLE trip.days ADD COLUMN title text NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE trip.days DROP COLUMN title;
