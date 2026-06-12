# S2 — Provision user + profile in one transaction

## Context
First sign-in must **provision a user** keyed by `google_sub` with fields from the verified identity, EUR
currency, `is_admin = false`, and an empty editable profile — all in a **single transaction** so a user
never exists without a profile (PRD §5.8, §7.7). This consumes the `VerifiedIdentity` from Epic 01 S3.

## Task
Implement a `provision`/`upsert` function in the `auth` module that creates a user (and profile row, if
modelled separately) transactionally from a `VerifiedIdentity`.

## Acceptance criteria
- [ ] A `User` repository/type maps the `auth.User` table (S1).
- [ ] On first sign-in, a `User` is created with `google_sub`, `email`, `name`, `avatar` from the
  identity, `default_currency = EUR`, `is_admin = false`, and an empty/default `prefs`.
- [ ] Creation happens in **one transaction** (user + any separate profile row together); a failure rolls
  back fully.
- [ ] The function returns the resulting user to the caller (callback → session, Epic 03).
- [ ] A unit test covers the create path with a fake repository/transaction.

## Constraints
- Profile fields may live on `User` (single row) or a separate row — either is fine; if separate, both are
  created in the same transaction. Keep it simple (PRD §7.0).
- EUR and `is_admin=false` are set server-side, not taken from client input.

## Definition of done
A first-time `VerifiedIdentity` produces a persisted user with EUR/empty-profile defaults, created
atomically; the create-path test is green.

## Dependencies
S1 (schema), Epic 01 S3 (VerifiedIdentity). Consumed by S3 (returning resolution), Epic 03 (session).
