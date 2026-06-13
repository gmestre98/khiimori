# Epic M02.2 — User provisioning & identity model (`auth.*`)

> Milestone: [02 — Auth & Profile](../README.md) · PRD refs: §5.7, §5.8, §7.7, §9.

## Description

Define the `User` entity and the `auth.*` schema, and make first sign-in **provision** a user plus
an empty profile **idempotently on `google_sub`**. A returning sign-in resolves to the same user;
an email change in Google must not create a duplicate. Includes the **admin bootstrap path** so the
first/author user can be designated `is_admin` without a public self-serve admin route, enabling
Milestone 08's backoffice.

**Estimated effort:** ~2 developer-days (one developer).

## Acceptance Criteria

- [ ] A migration creates the **`auth.*`** schema with a `User` row per PRD §9:
      `id, google_sub (unique), email, name, avatar, home_base, default_currency, prefs (JSONB),
      is_admin` (PRD §7.7, §9).
- [ ] **First sign-in provisions** a `User` keyed by `google_sub` with `email/name/avatar` from the
      verified identity, `default_currency = EUR` (fixed), `is_admin = false`, and an empty editable
      profile — created in a **single transaction** (PRD §5.8, §7.7).
- [ ] Provisioning is **idempotent on `google_sub`** (unique constraint): a returning sign-in
      resolves to the **same user**, and a changed Google email updates the existing row rather than
      creating a duplicate (PRD §5.8).
- [ ] An **admin bootstrap path** can mark a designated user `is_admin = true` (e.g. config-driven
      first-user or a one-off command), with no public self-serve admin route (PRD §5.8 → §5.9).
- [ ] Unit + integration tests cover first-time provisioning, returning-user resolution, and the
      email-change-no-duplicate case (PRD §7.6).

## Implementation Details / Architecture

- Lives in the **`auth` module** with the `auth.*` schema (PRD §7.1, §7.7).
- `prefs` JSONB holds theme preference and future toggles (PRD §9), keeping the column count small
  while staying flexible-within-Postgres (PRD §7.7).
- Provisioning is invoked by the OAuth callback (Epic 01) with a `VerifiedIdentity`; the profile row
  is created in the same transaction so a user never exists without a profile.
- The `is_admin` flag is the seam consumed by Milestone 08 (Sharing/Backoffice); this epic only
  creates and bootstraps it.

## Dependencies

- **Upstream:** M01.3 (DB, migrations, schema-per-module), Epic 01 (verified identity to provision
  from).
- **Downstream:** Epic 03 (sessions reference the provisioned user), Epic 04 (profile edits this
  row), Milestone 08 (consumes `is_admin` and membership).

## Costs Impact

Negligible. Identity data is a few small rows in the existing Neon database; no new billable
component (PRD §8 — within free tier).

## Designs

No UI in this epic — it is the data model and provisioning logic behind sign-in. The profile surface
that edits these fields is Epic 04 / Milestone 09.

## User stories

The epic is split into **5 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-auth-schema-user-migration.md) | `auth.*` schema & `User` migration | ~3h | AC1 | — (M01.3) |
| [S2](S2-provision-user-transaction.md) | Provision user + profile in one transaction | ~3.5h | AC2 | S1 (Epic 01 S3) |
| [S3](S3-returning-user-resolution.md) | Returning-user resolution & email-change-no-duplicate | ~2.5h | AC3 | S1, S2 |
| [S4](S4-admin-bootstrap.md) | Admin bootstrap path (`is_admin`) | ~2.5h | AC4 | S1, S2 |
| [S5](S5-provisioning-integration-tests.md) | Provisioning integration tests | ~3h | AC5 | S1–S4 (M01.3 S7) |

**Total:** ~14.5h (≈ 2 dev-days), consistent with the epic's ~2 dev-day estimate.

### Sequencing

```
S1 Schema ── S2 Provision (tx) ──┬─ S3 Returning resolution ──┐
                                 └─ S4 Admin bootstrap ────────┴─ S5 Integration tests
```
