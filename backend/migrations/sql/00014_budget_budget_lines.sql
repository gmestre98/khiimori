-- +goose Up
-- BudgetLine holds a planned amount per category at trip level (day_id IS NULL)
-- or per day. The fixed category set is enforced by a CHECK constraint.
--
-- actual_amount is present so the roll-up engine (Epic M05.2) can cache the
-- aggregated spend here; this migration sets it to 0 and leaves maintenance to
-- that engine.
--
-- The UNIQUE constraint on (trip_id, day_id, category) is the upsert key: a
-- second SET for the same tuple updates rather than duplicates. PostgreSQL
-- includes NULL in unique-index semantics when using NULLS NOT DISTINCT (PG 15+)
-- so a trip-level line (day_id NULL) and a per-day line for the same category
-- never collide.
CREATE TABLE budget.budget_lines (
    id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id        uuid    NOT NULL REFERENCES trip.trips (id) ON DELETE CASCADE,
    day_id         uuid    REFERENCES trip.days (id) ON DELETE CASCADE,
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
