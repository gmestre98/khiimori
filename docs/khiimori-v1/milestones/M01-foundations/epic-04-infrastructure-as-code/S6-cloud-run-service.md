# S6 — Cloud Run service

> **Status:** ✅ Done — Cloud Run service (scale-to-zero defaults) (#113). Deployed live to the dev stack.

## Context
The Go service runs on **Cloud Run** (PRD §7.8), which gives scale-to-zero on the free tier (PRD §8.1, §8.6).
This story provisions the Cloud Run service in Pulumi: it runs the container from Artifact Registry (S2) as
the least-privilege SA (S5), with health checks pointed at `/healthz` and `/readyz` (M01.2). Secret injection
is S7; scale tunables are S9 — here we stand up the service with safe defaults.

Assumes Artifact Registry (**S2**) and the service account (**S5**) exist.

## Task
Provision the Cloud Run service via Pulumi, running the service image as the dedicated SA.

## Acceptance criteria
- [x] A Cloud Run (v2) service is created in the configured region, using an image from the S2 registry
  (a placeholder/initial tag is fine until M01.5 pushes real images).
- [x] It runs as the **S5 service account** (not the default compute SA).
- [x] Liveness/startup probes point at **`/healthz`**, readiness at **`/readyz`** (M01.2 endpoints).
- [x] The container `PORT` aligns with the service's config (M01.2 S1) and the service listens on it.
- [x] The service URL is a Pulumi **stack output** (M01.6 web shell + CORS need it).
- [x] `run.googleapis.com` enabled via IaC; `pulumi up`/`destroy` work cleanly.

## Constraints
- Defaults to scale-to-zero (min-instances handled explicitly in S9); don't pin warm instances here.
- Secret values are injected in **S7** — don't bake secrets into the image or env literals.

## Definition of done
`pulumi up` provisions a Cloud Run service running as the SA with health probes set; its URL is exported.

## Dependencies
S2 (image registry), S5 (service account). Extended by S7 (secrets) and S9 (scale tunables).
