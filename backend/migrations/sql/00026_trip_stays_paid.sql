-- +goose Up
-- M12.2 S2: give a stay a `paid` flag so the budget can tell a booking that has
-- actually been paid apart from one that's still just planned. Only a paid stay
-- counts as spent in the roll-up; an unpaid stay is an upcoming estimate
-- (mirrors a plan item's done vs. planned distinction — M12.2 S1).
--
-- Defaults to false: a freshly-entered stay is a plan until you mark it paid, and
-- existing stays start as estimates until the traveller confirms they're paid.
ALTER TABLE trip.stays
    ADD COLUMN paid boolean NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE trip.stays DROP COLUMN paid;
