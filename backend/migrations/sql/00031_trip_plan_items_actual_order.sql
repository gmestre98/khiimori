-- +goose Up
-- Independent "What happened" ordering: give a plan item a second manual order,
-- `actual_order`, separate from `sort_order` (the planned-timeline position).
--
-- The Plan list orders by sort_order (the itinerary you intended); the
-- "What happened" list orders by actual_order (the sequence you actually did
-- things in). They were one column, so reordering one moved the other — this
-- decouples them, letting a day play out in a different order than planned.
--
-- Backfilled to the current sort_order so every existing item starts with its
-- actual order matching its planned order (no visible change until reordered).
ALTER TABLE trip.plan_items
    ADD COLUMN actual_order integer NOT NULL DEFAULT 0;

UPDATE trip.plan_items SET actual_order = sort_order;

-- +goose Down
ALTER TABLE trip.plan_items DROP COLUMN actual_order;
