-- +goose Up
-- Spontaneous marks a plan item that wasn't part of the original plan (added on
-- the go). Unlike "unplanned" (logged after the fact, kept out of the plan
-- list), a spontaneous item stays in the day's plan, tagged.
ALTER TABLE trip.plan_items ADD COLUMN spontaneous boolean NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE trip.plan_items DROP COLUMN spontaneous;
