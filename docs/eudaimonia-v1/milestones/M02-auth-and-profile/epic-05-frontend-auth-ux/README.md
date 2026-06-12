# Epic M02.5 — Frontend auth experience (context, route gating, profile screen)

> Milestone: [02 — Auth & Profile](../README.md) · PRD refs: §5.7, §5.8, §6, §7.2.

## Description

Wire the web app into the auth backend: a lightweight **auth context** that knows whether the user
is signed in, **route gating** that keeps protected screens behind a valid session, a **sign-in /
sign-out** affordance that drives the Google flow, and a **Profile screen** that reads and edits the
profile via Epic 04. The context reacts to the `401` contract from Epic 03 so an expired session
triggers a smooth re-auth rather than a broken page. Works on web and mobile (PRD §5.8).

**Estimated effort:** ~2 developer-days (one developer).

## Acceptance Criteria

- [ ] A **sign-in affordance** starts the Google flow (Epic 01) and a **sign-out** affordance ends
      the session (Epic 03); both work on web and mobile (PRD §5.8).
- [ ] An **auth context** exposes the current user and auth state to the app; **protected routes are
      gated** and redirect unauthenticated users to sign-in (PRD §6).
- [ ] The context **detects `401`** responses and triggers re-auth (or redirect to sign-in) without
      losing the user's place where reasonable (PRD §6, Epic 03).
- [ ] A **Profile screen** views and edits name, avatar, home base, and theme preference via Epic 04,
      and **displays EUR** as a non-editable field (PRD §5.7, §11.5).
- [ ] Changes made on the Profile screen **persist and reflect immediately** in the UI (PRD §5.7).

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
