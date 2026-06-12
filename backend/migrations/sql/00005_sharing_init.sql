-- +goose Up
-- Create the sharing module's schema. Owned by the connecting role (the
-- application role); see ../README.md for the schema-per-module rationale.
CREATE SCHEMA IF NOT EXISTS sharing;

-- +goose Down
-- RESTRICT (the default): fails loudly if the schema still holds objects, which
-- would mean a later module migration didn't roll back first.
DROP SCHEMA IF EXISTS sharing;
