# S3 — Returning-user resolution & email-change-no-duplicate

## Context
Provisioning must be **idempotent on `google_sub`**: a returning sign-in resolves to the **same user**,
and a changed Google email updates the existing row rather than creating a duplicate (PRD §5.8). This
builds directly on S2's provision function.

## Task
Make the provision function upsert on `google_sub`: resolve an existing user, update mutable identity
fields, and never create a duplicate.

## Acceptance criteria
- [ ] A second sign-in with the same `google_sub` resolves to the **same `User`** (no new row).
- [ ] If the Google `email` (or `name`/`avatar`) changed, the existing row is **updated**, not
  duplicated — keyed on `google_sub`.
- [ ] The upsert relies on the **unique `google_sub` constraint** (S1) so concurrent sign-ins can't create
  two rows.
- [ ] Unit tests cover returning-user resolution and the email-change-updates-existing case.

## Constraints
- Do not key on email (it can change); `google_sub` is the stable identity (PRD §5.8).
- User-mutable profile fields (`home_base`, theme `prefs`) are **not** overwritten by identity refresh —
  only the identity-sourced fields are refreshed.

## Definition of done
Repeat sign-ins map to one user; an email change updates rather than duplicates; tests are green.

## Dependencies
S1, S2. Tested further in S5; consumed by every authenticated flow.
