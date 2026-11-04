-- +goose Up
-- Packages: one price that covers several days of a trip (a guided tour, a
-- cruise, a ski week with lodging). Owned by the budget module. A package is
-- counted once in the money totals: paid_amount as spent, the rest of
-- total_cost as still to pay (estimated). Stays and plan items it covers are
-- linked in budget.package_links so their rows show "Included"; their own cost
-- fields keep meaning "extra on top" and are not part of the package price.
--
-- No cross-schema FKs per migrations/README: trip_id and the linked stay /
-- plan-item ids reference the trip module by id only. A link to an item that
-- was later deleted is harmless: reads only ever match existing ids.
CREATE TABLE budget.packages (
    id          uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id     uuid           NOT NULL,      -- application-level ref to trip.trips
    name        text           NOT NULL,
    provider    text           NOT NULL DEFAULT '',
    link        text           NOT NULL DEFAULT '',
    total_cost  numeric(12, 2) NOT NULL,
    paid_amount numeric(12, 2) NOT NULL DEFAULT 0,
    balance_due date,                         -- when the rest is due; NULL when paid or unknown
    start_date  date           NOT NULL,
    end_date    date           NOT NULL,
    includes    text[]         NOT NULL DEFAULT '{}',
    created_at  timestamptz    NOT NULL DEFAULT now(),
    updated_at  timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT packages_total_non_negative CHECK (total_cost >= 0),
    CONSTRAINT packages_paid_in_range CHECK (paid_amount >= 0 AND paid_amount <= total_cost),
    CONSTRAINT packages_dates_ordered CHECK (start_date <= end_date)
);
CREATE INDEX packages_trip_id_idx ON budget.packages (trip_id);

-- What a package covers: stays and plan items, by kind + id. Deleting a
-- package removes its links.
CREATE TABLE budget.package_links (
    package_id uuid NOT NULL REFERENCES budget.packages (id) ON DELETE CASCADE,
    item_kind  text NOT NULL,
    item_id    uuid NOT NULL,                 -- application-level ref to trip.stays / trip.plan_items
    PRIMARY KEY (package_id, item_kind, item_id),
    CONSTRAINT package_links_kind_check CHECK (item_kind IN ('stay', 'plan_item'))
);

-- +goose Down
DROP TABLE budget.package_links;
DROP TABLE budget.packages;
