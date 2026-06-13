# S6 — On `main`: build & push image to Artifact Registry

> **Status:** ✅ Done — main builds & pushes the SHA-tagged image to Artifact Registry (#124).

## Context
On merges to `main`, the pipeline builds the service container and pushes it to **Artifact Registry**, from
which Cloud Run deploys (PRD §7.5, §7.8). This story adds that build-and-push stage, using the Dockerfile
(S3), keyless GCP auth (S5), and the registry provisioned in IaC (M01.4 S2).

Assumes the Dockerfile (**S3**), WIF auth (**S5**), and the Artifact Registry repo (M01.4 S2) exist.

## Task
Add a `main`-only CI stage that builds the container image and pushes it to Artifact Registry.

## Acceptance criteria
- [x] Runs **only on `main`** (after lint/unit/build/integration pass).
- [x] Builds the image from the S3 Dockerfile and pushes it to the M01.4 Artifact Registry repo.
- [x] The image is tagged with the **commit SHA** (and optionally `latest`) so deploys are traceable/rollback-able.
- [x] Authenticates via **WIF** (S5) — no SA keys; no secrets in logs (PRD §8.5).
- [x] The pushed image reference (path + SHA tag) is passed to the deploy stage (S7).

## Constraints
- Don't rebuild what's unchanged unnecessarily; reuse caches to limit CI minutes (PRD §8.4 #4).
- Tag immutably by SHA — don't rely on a moving tag for the deploy reference.

## Definition of done
A merge to `main` produces a SHA-tagged image in Artifact Registry, pushed via keyless auth.

## Dependencies
S3 (Dockerfile), S5 (auth), M01.4 S2 (registry). Feeds S7 (deploy).
