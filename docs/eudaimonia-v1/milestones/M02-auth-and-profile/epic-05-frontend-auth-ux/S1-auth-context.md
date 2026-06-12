# S1 — Auth context & state

## Context
The web app needs a lightweight **auth context** that knows whether the user is signed in and exposes the
current user (PRD §5.8, §6). It is the single place the app asks "who is the user / am I signed in" and is
consumed by route gating (S3), the sign-in/out UI (S2), and the profile screen (S5). Builds on the M01.6
web app shell and Epic 03's session mechanism.

## Task
Implement an auth context provider + hook in the `/web` app that loads and exposes auth state.

## Acceptance criteria
- [ ] An auth context provider exposes `{ user, status }` (e.g. `loading | authenticated | anonymous`)
  and a hook to read it.
- [ ] On load, the context determines auth state by calling the backend (e.g. `GET /me` from Epic 04 S1,
  or a session check) using the env API URL from M01.6.
- [ ] The context exposes actions used by later stories (sign-in start, sign-out) as stable functions.
- [ ] State updates propagate to consumers so UI reacts to sign-in/out without a full reload.

## Constraints
- Keep it lightweight (provider + hook) — no heavy state library (PRD §7.0); confirm any new dependency
  with the author.
- Do not make authorization decisions here — only authentication state (PRD §5.9).

## Definition of done
The app can read auth state from one context/hook, populated from the backend session check.

## Dependencies
M01.6 (web shell, env API URL), Epic 03 (session), Epic 04 S1 (`/me`). Consumed by S2–S5.
