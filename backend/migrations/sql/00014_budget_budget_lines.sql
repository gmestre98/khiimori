-- +goose Up
-- BudgetLine holds a planned amount per category at trip level (day_id IS NULL)
-- or per day. The fixed category set is enforced by a CHECK constraint.
-- actual_amount is seeded to 0 and maintained by the Epic M05.2 roll-up engine.
--
-- NULLS NOT DISTINCT on the unique index treats NULL day_id as a distinct,
-- matchable value, so a trip-level line and a per-day line for the same category
-- conflict as expected, and a second upsert updates rather than duplicates.
-- No cross-schema FKs per migrations/README: trip_id and day_id reference the
-- trip module by id only; cascade/orphan cleanup is handled in application code.
CREATE TABLE budget.budget_lines (
    id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id        uuid    NOT NULL,
    day_id         uuid,
    category       text    NOT NULL,
    planned_amount numeric(12, 2) NOT NULL DEFAULT 0,
    actual_amount  numeric(12, 2) NOT NULL DEFAULT 0,
    CONSTRAINT budget_lines_category_check
        CHECK (category IN ('Stays', 'Transport', 'Food', 'Activities', 'Other')),
    CONSTRAINT budget_lines_amount_non_negative
        CHECK (planned_amount >= 0 AND actual_amount >= 0),
    CONSTRAINT budget_lines_trip_day_category_unique
        UNIQUE NULLS NOT DISTINCT (trip_id, day_id, category)
);

-- Index for listing all budget lines for a trip.
CREATE INDEX budget_lines_trip_id_idx ON budget.budget_lines (trip_id);

-- +goose Down
DROP TABLE budget.budget_lines;
