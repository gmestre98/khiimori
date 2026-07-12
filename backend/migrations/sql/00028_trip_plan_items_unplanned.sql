-- +goose Up
-- Day-tab refactor: mark a plan item as `unplanned` — created by "Log something
-- you did" after the fact rather than planned ahead. It lets the Day tab tell
-- the intended itinerary (Plan) apart from what actually happened: a planned
-- item you did shows in both groups, but a spontaneously-logged one shows only
-- under "what happened", so a no-plan day doesn't fill the Plan list with things
-- you never planned.
--
-- Defaults to false: every existing item, and every normal add, is part of the
-- plan. Only the log-a-done-item flow sets it true.
ALTER TABLE trip.plan_items
    ADD COLUMN unplanned boolean NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE trip.plan_items DROP COLUMN unplanned;
