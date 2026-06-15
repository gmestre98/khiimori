# Epic M02.5 — Frontend auth experience (context, route gating, profile screen)

> **Status:** ✅ Done — all 5 stories merged (PRs [#182](https://github.com/gmestre98/khiimori/pull/182)–[#186](https://github.com/gmestre98/khiimori/pull/186)) and all 5 acceptance criteria met (23 vitest component/unit tests; deployed web app live and wired to the API). React auth context + `useAuth`; react-router gating with return-to-intended; central 401 → re-auth; sign-in/out (the OAuth callback now redirects back to the SPA); and the gated `/profile` screen (view/edit, EUR read-only). The live Google sign-in click-through depends on the author provisioning the Google OAuth client in prod (a documented M02.1 prerequisite — `/auth/login` returns 503 `auth_unconfigured` until then); the code paths are covered by tests.
>
> Milestone: [02 — Auth & Profile](../README.md) · PRD refs: §5.7, §5.8, §6, §7.2.

## Description

Wire the web app into the auth backend: a lightweight **auth context** that knows whether the user
is signed in, **route gating** that keeps protected screens behind a valid session, a **sign-in /
sign-out** affordance that drives the Google flow, and a **Profile screen** that reads and edits the
profile via Epic 04. The context reacts to the `401` contract from Epic 03 so an expired session
triggers a smooth re-auth rather than a broken page. Works on web and mobile (PRD §5.8).

**Estimated effort:** ~2 developer-days (one developer).

## Acceptance Criteria

- [x] A **sign-in affordance** starts the Google flow (Epic 01) and a **sign-out** affordance ends
      the session (Epic 03); both work on web and mobile (PRD §5.8).
- [x] An **auth context** exposes the current user and auth state to the app; **protected routes are
      gated** and redirect unauthenticated users to sign-in (PRD §6).
- [x] The context **detects `401`** responses and triggers re-auth (or redirect to sign-in) without
      losing the user's place where reasonable (PRD §6, Epic 03).
- [x] A **Profile screen** views and edits name, avatar, home base, and theme preference via Epic 04,
      and **displays EUR** as a non-editable field (PRD §5.7, §11.5).
- [x] Changes made on the Profile screen **persist and reflect immediately** in the UI (PRD §5.7).

## Implementation Details / Architecture

- Part of the **`/web` React + TypeScript** app (PRD §7.2), reusing the app shell from M01.6.
- The auth context is intentionally lightweight (provider + hook) and is the single place the app
  asks "who is the user / am I signed in"; it consumes the session mechanism chosen in Epic 03.
- Screens use placeholder/basic styling now and adopt **Milestone 09** design-system components when
  available — this epic does not block on the design system landing.
- Theme preference selected here is persisted via the profile API and later drives Milestone 09
  theming.

## Dependencies

- **Upstream:** M01.6 (web app shell, env API URL, CORS), Epic 01 (sign-in flow), Epic 03 (session +
  `401` contract), Epic 04 (profile API).
- **Downstream:** Milestones 03–08 render inside the gated, authenticated app; Milestone 09 restyles
  these surfaces.

## Costs Impact

Negligible — static assets served from Firebase Hosting free tier (PRD §8.1).

## Designs

Sign-in and profile surfaces using the black/white theme (PRD §5.10); mobile context in
[assets/03-mobile-and-sharing.svg](../../../assets/03-mobile-and-sharing.svg). Directional only —
final components from Milestone 09.

## User stories

The epic is split into **5 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-auth-context.md) | Auth context & state | ~3h | AC2 | M01.6, Epic 03, Epic 04 S1 |
| [S2](S2-signin-signout-ui.md) | Sign-in / sign-out UI | ~3h | AC1 | S1, Epic 01, Epic 03 |
| [S3](S3-route-gating.md) | Protected route gating & redirect | ~2.5h | AC2 | S1, S2 |
| [S4](S4-401-reauth.md) | 401 detection → re-auth | ~2.5h | AC3 | S1, S3 |
| [S5](S5-profile-screen.md) | Profile screen (view/edit, EUR display) | ~3.5h | AC4, AC5 | S1, S3, Epic 04 |

**Total:** ~14.5h (≈ 2 dev-days), consistent with the epic's ~2 dev-day estimate.

### Sequencing

```
S1 Auth context ──┬─ S2 Sign-in/out UI ── S3 Route gating ──┬─ S4 401 → re-auth
                  └────────────────────────────────────────┴─ S5 Profile screen
```
