-- +goose Up
-- The PlanItem entity (PRD §9, §5.2), owned by the trip module. A plan item is
-- the flexible unit of a day's itinerary: activity, tour, transport, or loose
-- idea. Only title is required; all other fields are optional.
--
-- Backlog semantics: day_id = NULL means the item is an unscheduled backlog
-- idea (Epic 03 promote/demote moves it to a day). day_id NOT NULL places it
-- on a specific day.
--
-- Timed / untimed: start_time = NULL → untimed (loose); start_time NOT NULL →
-- timed. duration is independently optional even when start_time is set.
--
-- sort_order gives a stable within-day (or within-backlog) sequence so the
-- day view can render items in a consistent order. It is set by the application
-- and updated by Epic 04's reorder operations.
--
-- status is constrained to the five lifecycle states defined in PRD §9.
-- 'planned' is the default for items being actively placed on a day.
--
-- cost is owned here; Milestone 05 reads it through the Trip module interface
-- for budget roll-ups — no cross-schema FK. location feeds Milestone 07's map
-- pins when present.
--
-- trip_id cascades on Trip delete; day_id is SET NULL on Day delete so a plan
-- item whose day is removed falls back to the backlog rather than being lost.
CREATE TABLE trip.plan_items (
    id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id        uuid    NOT NULL REFERENCES trip.trips (id) ON DELETE CASCADE,
    day_id         uuid    REFERENCES trip.days (id) ON DELETE SET NULL,
    title          text    NOT NULL,
    type           text,
    start_time     time,
    duration       interval,
    location       text,
    booking_status text,
    cost           numeric,
    link           text,
    sort_order     integer NOT NULL DEFAULT 0,
    status         text    NOT NULL DEFAULT 'planned'
                           CHECK (status IN ('idea', 'planned', 'done', 'skipped', 'cancelled'))
);

-- Listing all plan items for a trip (e.g. backlog view, budget roll-up).
CREATE INDEX plan_items_trip_id_idx ON trip.plan_items (trip_id);

-- Listing plan items for a specific day, in order.
CREATE INDEX plan_items_day_id_order_idx ON trip.plan_items (day_id, sort_order);

-- +goose Down
DROP TABLE trip.plan_items;
