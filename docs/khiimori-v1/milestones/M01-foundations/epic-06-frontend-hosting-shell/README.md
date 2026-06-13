# Epic M01.6 — Frontend Hosting & App Shell

> **Status:** 🚧 Code complete; live round-trip pending a one-time bootstrap. All 5 stories are implemented — the shell builds + tests green in CI and deploys to **Firebase Hosting** on `main`, CORS is config-driven, the API base URL is env-driven, and custom-domain wiring is documented. The in-browser round-trip initially failed (`✗ Unreachable — Failed to fetch`) for two reasons the CI e2e smoke (server-to-server on `/readyz`) couldn't catch: (1) the web view probed `/healthz`, which Cloud Run doesn't route externally — **fixed to `/readyz`**; and (2) the running Cloud Run revision had an empty CORS allowlist because `pulumi up` hadn't run since S3 added the env — now **CI runs `pulumi up` automatically on `main`** ([`infra/README.md` → CI auto-reconcile](../../../../../infra/README.md)). **Done when:** the one-time CI bootstrap is set up (`PULUMI_STACK_NAME` + `PULUMI_ACCESS_TOKEN` + a first manual `pulumi up`); thereafter the health card shows `✓ Healthy` with no console CORS errors and stays reconciled.
>
> Milestone: [01 — Foundations](../README.md) · PRD refs: §7.2, §7.8.

## Description

Deploy a minimal React/TS app shell to Firebase Hosting + CDN and prove the full round-trip: the
deployed web app calls the deployed API's `/healthz` with CORS correctly configured and an
environment-driven API base URL.

**Estimated effort:** ~1–2 developer-days (one developer).

## Acceptance Criteria

- [x] The minimal app shell deploys to **Firebase Hosting + CDN** (PRD §7.8).
- [ ] The deployed app calls the API on Cloud Run and shows the result (end-to-end round-trip). _View + CI deploy done; the live browser round-trip is pending the `/readyz` fix deploy + `pulumi up` for CORS. NB: probes `/readyz`, not `/healthz` — Cloud Run doesn't route `/healthz` externally._
- [x] **CORS** is correctly configured between the Hosting origin and the Cloud Run API.
- [x] The API base URL is **environment-driven** (no hardcoded prod URL).
- [x] Custom-domain wiring is documented (the domain itself is author-provided).

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
[assets/01-trips-dashboard.svg](../../../assets/01-trips-dashboard.svg) (PRD §4.1).

## User stories

The epic is split into **5 small user stories**, each sized **≤4h for one developer**
(implementation + tests + review). Each story file is a standalone agent-ready prompt — hand a
single file to a coding agent and it has enough context (background, task, acceptance criteria,
constraints, dependencies, definition of done) to implement it without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-app-shell-env-api-url.md) | Minimal app shell with env-driven API base URL | ~3h | AC4 | — (M01.1 S5) |
| [S2](S2-healthz-view.md) | Health-check view (call `/healthz`, show result) | ~3h | AC2 | S1 (M01.2 S7) |
| [S3](S3-cors-config.md) | CORS between Hosting origin and Cloud Run API | ~3h | AC3 | M01.2, M01.4 S8 |
| [S4](S4-deploy-shell-verify-roundtrip.md) | Deploy shell to Firebase Hosting + verify round-trip | ~3h | AC1, AC2 | S1–S3 (M01.4/5) |
| [S5](S5-document-custom-domain.md) | Document custom-domain wiring | ~1.5h | AC5 | S4 (M01.4 S8) |

**Total:** ~13.5h (≈ 2 dev-days), consistent with the epic's ~1–2 dev-day estimate.

### Sequencing

```
S1 App shell + API URL ── S2 Health-check view ─┐
S3 CORS (API side, needs M01.2 + M01.4 hosting) ─┴─ S4 Deploy + verify round-trip ── S5 Custom-domain docs
```

S3 (API-side CORS) can be built in parallel with S1/S2; everything converges at S4's end-to-end verification.
