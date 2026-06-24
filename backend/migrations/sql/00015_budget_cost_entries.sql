-- +goose Up
-- CostEntry holds a manual cost entry (PRD §9, §5.4) owned by the budget module.
-- A cost entry has a category, amount (EUR), note, and optional links to a day
-- and/or plan item.
--
-- No cross-schema FKs per migrations/README: trip_id, day_id, and plan_item_id
-- reference the trip module by id only; orphan cleanup is handled in
-- application code.
CREATE TABLE budget.cost_entries (
    id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id      uuid         NOT NULL,
    day_id       uuid,
    plan_item_id uuid,
    category     text         NOT NULL,
    amount       numeric(12, 2) NOT NULL,
    note         text         NOT NULL DEFAULT '',
    created_at   timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT cost_entries_category_check
        CHECK (category IN ('Stays', 'Transport', 'Food', 'Activities', 'Other')),
    CONSTRAINT cost_entries_amount_non_negative
        CHECK (amount >= 0)
);

-- Aggregation reads filter on trip_id (and optionally day_id or category).
CREATE INDEX cost_entries_trip_id_idx ON budget.cost_entries (trip_id);
CREATE INDEX cost_entries_day_id_idx  ON budget.cost_entries (day_id) WHERE day_id IS NOT NULL;
CREATE INDEX cost_entries_trip_cat_idx ON budget.cost_entries (trip_id, category);

-- +goose Down
DROP TABLE budget.cost_entries;
