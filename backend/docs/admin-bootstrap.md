# Admin bootstrap

The first/author user must be designatable as an **admin** (`auth.users.is_admin`)
so Milestone 08's backoffice has an operator — without any public, self-serve
route to grant admin (PRD §5.8 → §5.9). Implemented in
[Epic M02.2 / S4](../../docs/khiimori-v1/milestones/M02-auth-and-profile/epic-02-user-provisioning-model/S4-admin-bootstrap.md).

## Mechanism

Set the **`ADMIN_EMAIL`** environment variable to the Google email of the
designated admin. During [user provisioning](../internal/auth/provision.go), if
the **verified** Google email of the signing-in user matches `ADMIN_EMAIL`
(case-insensitively), that user is provisioned with `is_admin = true`.

- **Non-public:** `ADMIN_EMAIL` is operator-set configuration (Secret Manager /
  Cloud Run env in prod, `backend/.env` locally). No HTTP route can set
  `is_admin`; the column defaults to `false` for everyone, and only this match
  flips it.
- **Verified email required:** the match only counts when Google's
  `email_verified` claim on the ID token is true, so an unverified email claim
  can never be used to assume the admin's privileges.
- **Idempotent:** the match runs on every sign-in. Re-running it on an already-
  admin user is a no-op; it is safe to leave configured.
- **Promote-only:** the provisioning upsert sets
  `is_admin = is_admin OR <email matches ADMIN_EMAIL>`. A sign-in can **grant**
  admin but never **revokes** it, so:
  - an admin whose Google email later changes away from `ADMIN_EMAIL` keeps the
    flag;
  - revoking admin is a deliberate Milestone 08 backoffice action, not a login
    side effect.
- **Disabled by default:** an unset/empty `ADMIN_EMAIL` matches no one — every
  user stays non-admin.

## Precedence with the identity refresh (S3)

A returning sign-in refreshes the Google-sourced identity fields
(`email`/`name`/`avatar`) but keys on the stable `google_sub`, never on email.
The admin decision is evaluated against the **freshly verified** email each
sign-in and then OR-ed into the stored flag (promote-only, above), so the
identity refresh and the bootstrap never fight: a refresh can promote a matching
user but cannot demote one.

## Setup

```sh
# prod: provided as Cloud Run env (sourced from config), e.g.
ADMIN_EMAIL=owner@example.com
```

Set it once for the environment, sign in as that user, and the row is marked
admin on that sign-in.
