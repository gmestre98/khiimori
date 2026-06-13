# S3 — Containerise the service (Dockerfile)

> **Status:** ✅ Done — distroless non-root Dockerfile; CI builds the image (#121).

## Context
Cloud Run deploys a **container image** (PRD §7.8), so the service needs a Dockerfile before CI can push and
deploy it (S6/S7). This story adds a small, secure, reproducible image build for the Go service and verifies
it builds in CI.

Assumes the buildable service (M01.2) and the build stage (**S2**) exist.

## Task
Add a Dockerfile for the Go service and verify the image builds in CI.

## Acceptance criteria
- [x] A multi-stage Dockerfile builds a **minimal** runtime image (e.g. distroless/static) running the service.
- [x] The image runs as a **non-root** user, listens on the configured `PORT` (M01.2 S1), and contains **no secrets**.
- [x] The base image and Go version are pinned; the build is reproducible.
- [x] CI builds the image (no push yet) to prove it compiles in a container.
- [x] Image size is reasonable (documented), and `/healthz`/`/readyz` work in a locally-run container.

## Constraints
- Minimal surface (PRD §7.0, §6) — no shell/package bloat in the final image.
- Secrets come from Secret Manager at runtime (M01.4 S7) — never baked into the image (PRD §8.5).

## Definition of done
`docker build` produces a small non-root image that serves `/healthz`; CI builds the same image on PRs.

## Dependencies
S2 (build stage), M01.2 (service). Consumed by S6 (push) and S7 (deploy).
