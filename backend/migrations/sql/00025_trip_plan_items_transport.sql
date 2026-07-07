-- +goose Up
-- Plan-redesign S2 (M12.1): transport items behave differently from the rest of
-- the itinerary — a leg of travel has an origin, a destination, and (often) an
-- arrival time distinct from its departure. The existing single `location` +
-- `start_time` shape can't express "Lisbon → Porto, 08:15–09:10".
--
-- Add three optional columns. They are generic, nullable, and NOT coupled to
-- `kind` at the database level (the UI only surfaces them for kind='transport',
-- M12.1 S5) — keeping the storage layer simple and avoiding surprising
-- validation rejections if an item's kind changes.
--
--   origin        where the leg starts (place name / description, like location)
--   destination   where the leg ends
--   arrive_time   arrival clock time; departure is the existing start_time.
--                 No ordering constraint vs start_time — overnight legs are valid.
ALTER TABLE trip.plan_items
    ADD COLUMN origin      text,
    ADD COLUMN destination text,
    ADD COLUMN arrive_time time;

-- +goose Down
ALTER TABLE trip.plan_items
    DROP COLUMN origin,
    DROP COLUMN destination,
    DROP COLUMN arrive_time;
