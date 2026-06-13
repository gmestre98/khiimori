# S7 — On `main`: deploy to Cloud Run (with migrations)

> **Status:** ✅ Done — main runs migrations then deploys the image to Cloud Run (#125).

## Context
After the image is pushed (S6), `main` deploys it to **Cloud Run** (PRD §7.5, §7.8). Database migrations
must run as part of deploy so the schema matches the code (M01.3). This story adds the deploy stage that
updates the Cloud Run service to the new image and applies pending migrations first.

Assumes the image push (**S6**), the IaC Cloud Run service (M01.4 S6/S7), and the migration runner (M01.3 S5) exist.

## Task
Add a `main`-only deploy stage that runs migrations and rolls the Cloud Run service to the new image.

## Acceptance criteria
- [x] **Migrations run before** the new revision serves traffic (using the M01.3 S5 runner against the prod DB via the direct connection).
- [x] The Cloud Run service is updated to the **SHA-tagged image** from S6 (consistent with the IaC-managed service — no drift).
- [x] Deploy uses **WIF** auth (S5); the DB/connection secrets come from Secret Manager, never CI logs (PRD §8.5).
- [x] A failed migration **aborts the deploy** (no half-migrated, mismatched revision).
- [x] Post-deploy, the new revision passes its `/readyz` check before the stage is green.

## Constraints
- Keep IaC (M01.4) as the source of truth for the service shape; the pipeline updates the image/revision, it
  doesn't fork the config.
- Don't run destructive migrations automatically without review — forward migrations only in v1.

## Definition of done
A merge to `main` runs migrations then deploys the new image to Cloud Run, and the new revision is ready.

## Dependencies
S6 (image), S5 (auth), M01.3 S5 (migrations), M01.4 S6/S7 (Cloud Run + secrets).
