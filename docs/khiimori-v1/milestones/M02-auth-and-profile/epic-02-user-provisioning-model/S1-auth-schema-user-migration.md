# S1 — `auth.*` schema & `User` migration

## Context
Milestone 02 introduces the identity data model. Per schema-per-module (PRD §7.7), the `auth` module owns
the **`auth.*`** schema. The `User` entity (PRD §9) is keyed by `google_sub` and holds the profile fields.
Assumes the migration runner and schema-per-module layout from M01.3 (S4/S5) exist.

## Task
Add a migration that creates the `auth` schema and the `User` table.

## Acceptance criteria
- [ ] A migration creates the **`auth`** schema (if not already created by M01.3's schema-per-module
  scaffold) and a `User` table with: `id`, `google_sub` (**unique, not null**), `email`, `name`,
  `avatar`, `home_base`, `default_currency`, `prefs` (JSONB), `is_admin` (default false).
- [ ] `google_sub` has a **unique constraint** (the idempotency key for provisioning).
- [ ] `default_currency` defaults to **`EUR`**; `is_admin` defaults to **false**.
- [ ] The migration runs forward cleanly via the M01.3 runner and is covered by the migration test setup.

## Constraints
- Follow the existing migration tool/conventions chosen in M01.3 — do not introduce a different tool.
- No application code here beyond the migration; the Go `User` type/repository is part of S2.

## Definition of done
The `auth.User` table exists with the unique `google_sub` constraint and EUR/false defaults; migration
applies cleanly.

## Dependencies
M01.3 S4 (schema-per-module), M01.3 S5 (migration runner). Consumed by S2–S5.
