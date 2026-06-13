# S4 — Deploy app shell to Firebase Hosting + verify round-trip

> **Status:** 🚧 Deploy path done; live round-trip pending. Pipeline deploys the shell to Hosting (CI green); deploy path + verification checklist in [`deploy-and-verify-runbook.md`](deploy-and-verify-runbook.md) ([#136](https://github.com/gmestre98/khiimori/pull/136)). The in-browser round-trip is **not yet green** — it needs the `/readyz` view fix deployed **and** `pulumi up` to apply `CORS_ALLOWED_ORIGINS` to the running revision (see the runbook's CORS prerequisite).

## Context
This story proves the foundation works end to end: the shell deploys to **Firebase Hosting + CDN** and the
**deployed** app calls the **deployed** API's `/healthz` successfully (epic AC1, AC2). It ties together the
shell (S1), the health view (S2), CORS (S3), the Hosting site (M01.4 S8), and the deploy pipeline (M01.5 S8).

Assumes S1–S3, the Hosting site (M01.4 S8), and the web deploy pipeline (M01.5 S8) exist.

## Task
Deploy the app shell to Firebase Hosting and verify the deployed-to-deployed `/healthz` round-trip.

## Acceptance criteria
- [x] The app shell is served from **Firebase Hosting + CDN** at the Hosting URL.
- [ ] The deployed app, built with the **production API base URL** (S1), successfully calls the deployed
  Cloud Run readiness probe and shows healthy (epic AC2). _Pending the `/readyz` view fix deploy + `pulumi up` for CORS. (Probes `/readyz`, not `/healthz` — Cloud Run doesn't route `/healthz` externally.)_
- [ ] CORS (S3) works from the real Hosting origin to the real API — no console CORS errors. _Pending `pulumi up`: the running revision's `CORS_ALLOWED_ORIGINS` is currently empty._
- [x] Deployment goes through the **pipeline** (M01.5 S8), not a manual one-off, and is documented.
- [x] A short manual verification checklist (load URL → see healthy) is recorded.

## Constraints
- Stay within Firebase Hosting + CDN free tier (PRD §8.1).
- Don't bypass the pipeline/IaC — this validates the real path.

## Definition of done
Visiting the deployed Hosting URL shows the shell reporting the deployed API as healthy, served via CDN.

## Dependencies
S1, S2, S3, M01.4 S8 (Hosting site), M01.5 S8 (web deploy). Satisfies epic AC1+AC2.
