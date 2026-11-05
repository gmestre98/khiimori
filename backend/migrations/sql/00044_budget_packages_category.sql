-- +goose Up
-- A package counts toward one budget category (default Other), so its price
-- sits next to that category's budget: what's paid as spent, the rest as
-- booked. Same fixed set as cost entries and budget lines.
ALTER TABLE budget.packages
    ADD COLUMN category text NOT NULL DEFAULT 'Other',
    ADD CONSTRAINT packages_category_check
        CHECK (category IN ('Stays', 'Transport', 'Food', 'Activities', 'Other'));

-- +goose Down
ALTER TABLE budget.packages DROP CONSTRAINT packages_category_check, DROP COLUMN category;
