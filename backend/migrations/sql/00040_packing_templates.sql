-- +goose Up
-- Reusable packing-list templates. A template is a named, saved list a user can
-- copy into any trip so common items (e.g. a "Cold-weather safety" kit) need not
-- be retyped each trip. Templates are personal: owner_id scopes them to the user
-- who saved them (application-level ref to auth.users — no cross-schema FK, same
-- as trip.trips.owner_id).
CREATE TABLE packing.templates (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id   uuid        NOT NULL,                       -- application-level ref to auth.users
    name       text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- The list read is "all templates for a user"; index the owner_id.
CREATE INDEX packing_templates_owner_id_idx ON packing.templates (owner_id);

-- A template's items mirror packing.items minus the trip-scoped state (no packed
-- flag — a freshly copied item starts unpacked). This FK IS within the packing
-- schema, so it is allowed (the no-cross-schema-FK rule is about crossing module
-- boundaries): deleting a template removes its items.
CREATE TABLE packing.template_items (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id uuid        NOT NULL REFERENCES packing.templates(id) ON DELETE CASCADE,
    category    text        NOT NULL DEFAULT '',
    label       text        NOT NULL,
    quantity    integer     NOT NULL DEFAULT 1 CHECK (quantity >= 1),
    note        text        NOT NULL DEFAULT '',
    position    integer     NOT NULL DEFAULT 0
);

CREATE INDEX packing_template_items_template_id_idx ON packing.template_items (template_id);

-- +goose Down
DROP TABLE packing.template_items;
DROP TABLE packing.templates;
