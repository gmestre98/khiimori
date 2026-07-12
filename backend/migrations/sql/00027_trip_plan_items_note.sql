-- +goose Up
-- Day-tab refactor: give a plan item an optional free-text `note` so a thing you
-- actually did (a done item logged after the fact, often spontaneous) can carry a
-- line of context of its own, without touching the day's journal entry. It is
-- independent of `type` (budget category) and `booking_status`; the UI surfaces
-- the note on items in the "what happened" group, but the column is not coupled
-- to status.
--
-- Nullable with no default: an item without a note stores NULL, matching the
-- other optional plan-item columns.
ALTER TABLE trip.plan_items
    ADD COLUMN note text;

-- +goose Down
ALTER TABLE trip.plan_items DROP COLUMN note;
