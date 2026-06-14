# Milestone 02 — Auth & Profile

> The identity layer every feature is built on: Google SSO sign-in, first-sign-in user
> provisioning, server-validated sessions exposed as auth middleware, and a basic editable profile.
> Outcome: a trustworthy "who is this request" answer that Milestones 03–10 depend on.
>
> PRD refs: §3, §5.7, §5.8, §6 (Security), §7.1 (Auth/User module), §9 (User entity).

---

**Status: 🚧 In progress** — epics **01 (Google OAuth sign-in)**, **02 (user provisioning & identity model)**, **03 (sessions & auth middleware)**, and **04 (profile management)** are ✅ done (PRs [#157](https://github.com/gmestre98/khiimori/pull/157)–[#180](https://github.com/gmestre98/khiimori/pull/180)). A successful sign-in provisions/resolves the user **and issues an authenticated session**; shared auth middleware validates it on every request (401 when missing/expired), `POST /auth/logout` signs out, and `GET`/`PATCH /me` read/edit the session user's own profile (EUR read-only) — all verified live on the deployed service. Only **epic 05 (frontend auth UX)** remains — the backend identity layer is complete; the browser-facing sign-in/route-gating/profile screen is next.

## Milestone goal

Give the app its identity. Sign-in is **Google SSO / OAuth only** — no passwords in v1. The first
successful sign-in **provisions a user record and an empty profile**; subsequent sign-ins resolve
to the same user via the Google subject id. An authenticated session is issued and validated on
every request, exposed as **auth middleware** that every later module's handlers use. Users can
view and edit a basic profile (name, avatar, home base, theme preference); currency is fixed to
**EUR**, shown but not editable. This milestone establishes *authentication* (who you are) and the
middleware hook; *trip authorization* (what you may touch) is owned by the Sharing module
(Milestone 08) and consumes the identity established here.

## Milestone-level Definition of Done

- A user can **sign in with Google** from web and mobile; no other auth method exists, and the
  OAuth client secret and signing keys live **only in Secret Manager** (PRD §5.8, §6, §8.5).
- First sign-in **creates a `User`** keyed by `google_sub` (with `email`, `name`, `avatar`,
  `default_currency = EUR`, `is_admin = false`) and an empty profile; returning sign-in resolves
  to the **same user** (PRD §5.8, §9).
- Every request is **authenticated by shared middleware**: expired/missing credentials yield `401`;
  the client can detect this and re-auth, and a **sign-out** invalidates the session (PRD §6).
- **Profile view/edit** works on web and mobile (name, avatar, home base, theme); EUR is displayed
  and not editable (PRD §5.7).
- Unit + integration tests cover provisioning, returning-user resolution, and the authz middleware
  (PRD §7.6).

## Epics in this milestone

| Epic | Title | AC | Est. (dev-days) | Cost-relevant | Status |
|------|-------|----|-----------------|---------------|--------|
| [01](epic-01-google-oauth-signin/README.md) | Google OAuth sign-in (OIDC authorization-code flow) | 5 | ~2–3 | — | ✅ Done |
| [02](epic-02-user-provisioning-model/README.md) | User provisioning & identity model (`auth.*`) | 5 | ~2 | — | ✅ Done |
| [03](epic-03-sessions-auth-middleware/README.md) | Sessions & auth middleware | 5 | ~2–3 | — | ✅ Done |
| [04](epic-04-profile-management/README.md) | Profile management (view/edit, EUR fixed) | 4 | ~1–2 | — | ✅ Done |
| [05](epic-05-frontend-auth-ux/README.md) | Frontend auth experience (context, route gating, profile screen) | 5 | ~2 | — | ⬜ Pending |
| | **Milestone total** | **24** | **~9–12** (≈ 2–2.5 weeks, one developer) | | **4 / 5 epics** |

> **Estimates** assume one developer familiar with the stack; they cover implementation, tests, and
> review, and exclude author-provided prerequisites (Google OAuth client ID/secret and authorized
> redirect URIs configured in the Google Cloud console).

## Sequencing within the milestone

```
01 Google OAuth sign-in ──┐
02 User provisioning & model ──┤
                               ├─ 03 Sessions & auth middleware ──┐
                                                                  ├─ 04 Profile management
                                                                  └─ 05 Frontend auth experience
```

Epics 01 and 02 can proceed in parallel (the OAuth callback consumes provisioning once both land).
Epic 03 needs an identity to put in a session; Epics 04 and 05 build on the session/middleware.

## Designs

Profile and sign-in are simple form/screen surfaces using the black/white theme (PRD §5.10); the
mobile profile/sharing context is illustrated in
[assets/03-mobile-and-sharing.svg](../../assets/03-mobile-and-sharing.svg). Final visual treatment
is delivered via the design system in Milestone 09.
