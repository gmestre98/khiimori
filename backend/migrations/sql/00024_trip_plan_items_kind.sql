-- +goose Up
-- Plan-redesign S1 (M12.1): give every plan item a first-class `kind` that
-- describes how it behaves while planning — distinct from its budget category.
--
-- Motivation: until now the `type` column did double duty as a loose category
-- label AND the value the budget roll-up maps to a spend category. That conflated
-- two unrelated ideas. A traveller thinks in terms of *what an item is* — an
-- activity, a leg of transport, a meal, or a plain note/reminder — and each of
-- those behaves differently (transport has an origin→destination and an arrival
-- time; a note has no time, place, or cost). `kind` captures that behaviour.
--
-- `type` is left in place and now means the **budget category** only (Transport,
-- Food, Activities, Stays, Other); the composition-root cost reader keeps mapping
-- it, so budget roll-ups are unaffected. Later stories auto-suggest `type` from
-- `kind` in the UI while keeping it independently overridable.
--
-- kind is NOT NULL with a CHECK to the four allowed values and defaults to
-- 'activity' — the safe fallback for the offline write queue replaying older
-- create payloads that predate this column (PRD §6).
ALTER TABLE trip.plan_items
    ADD COLUMN kind text NOT NULL DEFAULT 'activity'
        CHECK (kind IN ('activity', 'transport', 'food', 'note'));

-- Backfill kind for existing rows from the historical `type`/category label so
-- old itineraries keep sensible behaviour. Anything that isn't clearly transport
-- or food stays 'activity' (the column default already applied it).
UPDATE trip.plan_items
SET kind = CASE
    WHEN lower(coalesce(type, '')) IN
        ('transport', 'flight', 'train', 'bus', 'car', 'ferry', 'taxi', 'transfer') THEN 'transport'
    WHEN lower(coalesce(type, '')) IN
        ('food', 'restaurant', 'cafe', 'meal', 'drink', 'lunch', 'dinner', 'breakfast') THEN 'food'
    ELSE 'activity'
END;

-- +goose Down
ALTER TABLE trip.plan_items DROP COLUMN kind;
