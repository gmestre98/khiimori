# S1 — Pulumi (TS) project scaffold & GCP provider

## Context
All cloud infrastructure for Khiimori is defined in **Pulumi (TypeScript)** targeting GCP — one language
across infra and scripting (PRD §7.4). This story stands up the Pulumi project in `/infra`: the program,
the GCP provider, and a typed stack-config surface that later stories add resources to. No billable
resources yet — just a `pulumi preview`-clean program.

Assumes the `/infra` directory from M01.1 exists. Author-provided: a GCP project with billing enabled (PRD §8.3).

## Task
Initialise a Pulumi TypeScript project in `/infra` wired to the GCP provider, with stack config for project/region.

## Acceptance criteria
- [ ] A Pulumi TS program lives in `/infra` with pinned `@pulumi/pulumi` and `@pulumi/gcp` versions.
- [ ] GCP **project id** and **region** come from stack config (e.g. `Pulumi.dev.yaml`), not hardcoded.
- [ ] A `dev` stack exists; `pulumi preview` runs clean with **no resources** (or only trivial ones).
- [ ] Pulumi state backend choice is documented (e.g. Pulumi Cloud free tier or a GCS backend).
- [ ] TS lint/build for `/infra` is wired into the existing web/scripts toolchain (PRD §7.3, §7.4).

## Constraints
- TypeScript only; reuse the existing Node toolchain — no second IaC language/tool (PRD §7.0, §7.4).
- Do not commit any service-account keys or secrets; auth via `gcloud`/ADC locally.

## Definition of done
`cd infra && pulumi preview` runs clean against the `dev` stack using config-supplied project + region.

## Dependencies
M01.1 (`/infra`). Author-provided GCP project. Upstream of all other epic-04 stories.
