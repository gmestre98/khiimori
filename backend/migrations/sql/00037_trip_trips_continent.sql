-- +goose Up
-- Add an optional continent tag to a trip (Past-trips filtering, M-later). The
-- app has no reliable way to derive a continent from the free-text destination
-- list, so it is a user-set field on the trip: empty when unset, otherwise one
-- of the seven continents as a stable lowercase slug. A CHECK pins the allowed
-- values (mirroring the status/currency pattern on this table) so an invalid
-- continent can never be persisted even if the API validation were bypassed.
ALTER TABLE trip.trips
    ADD COLUMN continent text NOT NULL DEFAULT '',
    ADD CONSTRAINT trips_continent_check CHECK (
        continent IN (
            '', 'africa', 'antarctica', 'asia', 'europe',
            'north_america', 'oceania', 'south_america'
        )
    );

-- +goose Down
ALTER TABLE trip.trips
    DROP CONSTRAINT trips_continent_check,
    DROP COLUMN continent;
