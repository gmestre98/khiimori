# Milestone 02 — Auth & Profile

**Status:** Milestone overview — to be split into focused epics (≤5 acceptance criteria each) following the [Milestone 01](../M01-foundations/README.md) pattern. The criteria below are the milestone-level spec and the source material for that split.

> Google SSO sign-in, first-sign-in user provisioning, sessions, and a basic editable profile.
>
> PRD refs: §3, §5.7, §5.8, §6 (Security), §7.1 (Auth/User module), §9 (User entity).

---

## Description

Give the app its identity layer. Sign-in is **Google SSO / OAuth only** — no passwords in v1.
The first successful sign-in **provisions a user record and an empty profile**; subsequent
sign-ins resolve to the same user via the Google subject id. Users can view and edit a basic
profile (name, avatar, home base, theme preference). Currency is fixed to **EUR** and shown but
not editable in v1.

This is the gate for all personal data: every later epic relies on a trustworthy "who is this
request" answer, enforced server-side.

## Acceptance Criteria

- [ ] A user can **sign in with Google** from web and mobile; no other auth method exists (PRD §5.8).
- [ ] First sign-in **creates a `User`** keyed by `google_sub`, with `email`, `name`, `avatar`
      populated from the OAuth profile, an empty editable profile, `default_currency = EUR`
      (fixed), and `is_admin = false` by default (PRD §5.8, §9).
- [ ] Returning sign-in resolves to the **same user** via `google_sub`; email change in Google
      does not create a duplicate.
- [ ] An authenticated **session/token** is issued and validated on every request; expired or
      missing credentials yield `401`; the client can detect this and re-auth (PRD §6).
- [ ] **Profile view/edit** works on web and mobile: name, avatar, home base, theme preference;
      changes persist and are reflected immediately (PRD §5.7).
- [ ] Currency is displayed as **EUR** and is **not editable** (forward-compatible field, no UI —
      PRD §5.7, §9, §11.5).
- [ ] A way to **sign out** that invalidates the session client-side (and server-side if applicable).
- [ ] The first/admin user can be designated as `is_admin` (bootstrap path), enabling Epic 08's
      backoffice without a public self-serve admin route.
- [ ] OAuth client secret and signing keys live **only in Secret Manager**; tokens are never
      logged (PRD §6, §8.5).
- [ ] Unit + integration tests cover provisioning, returning-user resolution, and authz middleware
      (PRD §7.6).

## Implementation Details / Architecture

- Lives in the **`auth` module** (PRD §7.1) with its own `auth.*` schema (PRD §7.7).
- **Google OAuth** behind a thin internal `IdentityProvider` interface so it can be swapped
  (PRD §7.0). v1 implementation: Google OAuth 2.0 / OpenID Connect authorization-code flow.
- **Session strategy:** prefer a server-validated session (httpOnly secure cookie) or a
  short-lived signed token + refresh; chosen mechanism documented. Whichever is picked, the
  validation is exposed as **auth middleware** used by every other module's handlers.
- Provisioning is **idempotent on `google_sub`** (unique constraint); profile row created in the
  same transaction (PRD §7.7 transactional integrity).
- `User` fields per PRD §9: `id, google_sub, email, name, avatar, home_base, default_currency,
  prefs (JSONB), is_admin`. `prefs` JSONB holds theme and future toggles.
- Frontend: a lightweight auth context that gates routes, plus a Profile screen reusing the
  design-system components from Epic 09.
- **Authorization vs. authentication:** this epic establishes *authentication* (who you are) and
  the middleware hook; *trip authorization* (what you may touch) is owned by the Sharing module
  (Epic 08, PRD §5.9) and consumes the identity established here.

## Dependencies

- **Upstream:** Epic 01 (service skeleton, secrets, DB, web shell).
- **External/manual:** Google OAuth **client ID/secret** and authorized redirect URIs configured
  in the GCP/Google Cloud console (author-provided).
- **Downstream:** Epics 03–08 (all need an authenticated user); Epic 08 builds trip authorization
  and the admin surface on top of `is_admin`.

## Costs Impact

Negligible. Google OAuth is free; identity data is a few small rows in the existing Neon database.
No new billable component. (PRD §8 — within free tier.)

## Designs

Profile and sign-in are simple form/screen surfaces using the black/white theme (PRD §5.10);
the mobile sharing/profile context is illustrated in
[assets/03-mobile-and-sharing.svg](../assets/03-mobile-and-sharing.svg). Final visual treatment
is delivered via the design system in Epic 09.
