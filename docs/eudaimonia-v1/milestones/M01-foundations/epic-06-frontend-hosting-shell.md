# Epic M01.6 — Frontend Hosting & App Shell

> Milestone: [01 — Foundations](README.md) · PRD refs: §7.2, §7.8.

## Description

Deploy a minimal React/TS app shell to Firebase Hosting + CDN and prove the full round-trip: the
deployed web app calls the deployed API's `/healthz` with CORS correctly configured and an
environment-driven API base URL.

**Estimated effort:** ~1–2 developer-days (one developer).

## Acceptance Criteria

- [ ] The minimal app shell deploys to **Firebase Hosting + CDN** (PRD §7.8).
- [ ] The deployed app calls `GET /healthz` on Cloud Run and shows the result (end-to-end round-trip works).
- [ ] **CORS** is correctly configured between the Hosting origin and the Cloud Run API.
- [ ] The API base URL is **environment-driven** (no hardcoded prod URL).
- [ ] Custom-domain wiring is documented (the domain itself is author-provided).

## Implementation Details / Architecture

- One React/TS codebase will later serve laptop + mobile/PWA (PRD §7.2); this epic only ships the
  shell and connectivity — theming/PWA is Milestone 09.
- Hosting and CDN come from the Firebase free tier (PRD §8.1).

## Dependencies

- **Upstream:** M01.1 (web app), M01.2 (`/healthz`), M01.4 (Hosting site + API URL), M01.5 (deploy).
- **Downstream:** Milestone 09 (design system/PWA) and every feature UI build on this shell.

## Costs Impact

None beyond free tier — Firebase Hosting + CDN sit within the free allowance (PRD §8.1). The
**domain (~€1/mo / €10–15 yr)** is the only fixed cost and is author-provided (PRD §8.3).

## Designs

App shell only; real screens/theme arrive in Milestone 09. Mockups for context:
[assets/01-trips-dashboard.svg](../../assets/01-trips-dashboard.svg) (PRD §4.1).
