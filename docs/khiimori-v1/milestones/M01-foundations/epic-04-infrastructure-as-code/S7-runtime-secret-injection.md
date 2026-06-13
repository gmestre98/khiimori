# S7 — Inject secrets into Cloud Run at runtime

> **Status:** ✅ Done — runtime secret injection into Cloud Run (#114). Deployed live to the dev stack.

## Context
Secrets must reach the service **at runtime from Secret Manager** — never committed, never baked into the
image, never shipped to the client (PRD §6, §8.5). This story wires the S4 secrets into the S6 Cloud Run
service as secret-backed environment variables / mounts, so the app reads the DB URL, OAuth client, and Maps
key through its config layer (M01.2 S1) with no plaintext anywhere.

Assumes the secrets (**S4**), the SA grant (**S5**), and the Cloud Run service (**S6**) exist.

## Task
Configure the Cloud Run service to source its secrets from Secret Manager at runtime via Pulumi.

## Acceptance criteria
- [x] DB URL, OAuth client, and Maps key are exposed to the container as **Secret Manager-backed** env vars
  (or mounted secrets), referencing the S4 secret **versions** — not literal values.
- [x] No secret value appears in the Pulumi program, committed config, container image, or CI logs (PRD §8.5).
- [x] The env var names match what the app's config layer (M01.2 S1) expects.
- [x] Rotating a secret version updates the running service via `pulumi up` (or the documented version pin) without code changes.
- [x] `pulumi up` applies cleanly and the service boots reading secrets from the environment.

## Constraints
- Runtime injection only — do not pass secrets as build args or commit them anywhere (PRD §6, §8.5).
- Least privilege: the service reads only the secrets granted in S5.

## Definition of done
`pulumi up` configures the Cloud Run service to read all three secrets at runtime from Secret Manager, with
zero plaintext in repo/state/logs.

## Dependencies
S4 (secrets), S5 (access), S6 (service). Satisfies epic AC3.
