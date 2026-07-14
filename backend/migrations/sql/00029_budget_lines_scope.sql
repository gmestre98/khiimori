-- +goose Up
-- Enhanced budgeting: give a budget line a `scope` so a category can be budgeted
-- three ways that compose (Day-tab budget model):
--   'trip'  — a whole-trip lump for the category (day_id IS NULL). Existing.
--   'daily' — a per-day allowance that applies to every day (day_id IS NULL). NEW.
--   'day'   — an extra on one specific day (day_id set). Existing per-day lines.
--
-- 'trip' and 'daily' are both trip-level (day_id NULL) but distinct amounts for
-- the same category, so scope joins the unique key to let both coexist.
ALTER TABLE budget.budget_lines
    ADD COLUMN scope text NOT NULL DEFAULT 'trip'
        CONSTRAINT budget_lines_scope_check CHECK (scope IN ('trip', 'daily', 'day'));

-- Existing per-day lines (day_id set) are day extras.
UPDATE budget.budget_lines SET scope = 'day' WHERE day_id IS NOT NULL;

-- Widen the uniqueness to include scope so a category can carry a trip lump AND
-- a daily allowance (both day_id NULL) without colliding.
ALTER TABLE budget.budget_lines
    DROP CONSTRAINT budget_lines_trip_day_category_unique;
ALTER TABLE budget.budget_lines
    ADD CONSTRAINT budget_lines_trip_day_category_scope_unique
        UNIQUE NULLS NOT DISTINCT (trip_id, day_id, category, scope);

-- +goose Down
ALTER TABLE budget.budget_lines
    DROP CONSTRAINT budget_lines_trip_day_category_scope_unique;
ALTER TABLE budget.budget_lines
    ADD CONSTRAINT budget_lines_trip_day_category_unique
        UNIQUE NULLS NOT DISTINCT (trip_id, day_id, category);
ALTER TABLE budget.budget_lines DROP COLUMN scope;
