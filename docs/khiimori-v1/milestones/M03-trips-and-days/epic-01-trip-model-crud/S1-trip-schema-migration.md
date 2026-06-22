# S1 — `trip.*` schema & `Trip` migration

## Context
Milestone 03 introduces trips. Per schema-per-module (PRD §7.7), the `trip` module owns the **`trip.*`**
schema. The `Trip` entity (PRD §9) is the structural backbone for days, planning, budgets, journal, and
maps. Assumes the migration runner/schema-per-module layout from M01.3.

## Task
Add a migration that creates the `trip` schema and the `Trip` table.

## Acceptance criteria
- [x] A migration creates the **`trip`** schema and a `Trip` table with: `id`, `owner_id` (FK to
  `auth.User`), `name`, `destinations`, `start_date`, `end_date`, `base_currency`, `cover`, `status`.
- [x] `base_currency` defaults to **`EUR`**; `status` carries active/archived state with a sensible
  default (active).
- [x] `destinations` is modelled to support multiple destinations (e.g. JSONB or a text array — chosen
  approach documented). **Implemented as `text[]`.**
- [x] The migration applies cleanly via the M01.3 runner and is covered by the migration test setup.

## Constraints
- Follow the existing migration tool/conventions (M01.3); no new tool.
- Foreign key to `auth.User` (Milestone 02) for `owner_id`.

## Definition of done
The `trip.Trip` table exists with EUR default and a status field; migration applies cleanly.

## Dependencies
M01.3 (migrations), Milestone 02 (User for `owner_id`). Consumed by S2–S5 and Epic 02 (days).
