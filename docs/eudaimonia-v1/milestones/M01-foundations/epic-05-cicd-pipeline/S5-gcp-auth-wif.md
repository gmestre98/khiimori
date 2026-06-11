# S5 — GCP auth from Actions (Workload Identity Federation)

## Context
The deploy stages (S6–S8) need to authenticate to GCP, but the project's security posture forbids long-lived
service-account keys in CI (PRD §6, §8.5). This story sets up **Workload Identity Federation** so GitHub
Actions gets short-lived, keyless GCP credentials. The WIF pool/provider and the CI deployer service account
are IaC (M01.4); this story wires the Actions side and verifies auth.

Assumes the IaC stack (M01.4) and the base workflow (**S1**) exist.

## Task
Configure keyless GCP authentication from GitHub Actions via Workload Identity Federation.

## Acceptance criteria
- [ ] A reusable auth step authenticates to GCP using **WIF** (`google-github-actions/auth`) — **no JSON key** in secrets.
- [ ] The CI deployer service account and WIF pool/provider binding are defined in IaC (M01.4) or documented if added there.
- [ ] The deployer SA is **least-privilege**: only the roles needed to push images, deploy Cloud Run, and deploy Hosting (PRD §6).
- [ ] A trivial authenticated `gcloud`/API call in CI proves auth works, with no credentials leaked to logs.
- [ ] Auth is scoped to the intended branch/environment (e.g. `main` for deploys).

## Constraints
- No exported SA keys anywhere (PRD §8.5) — federation only.
- Least privilege for the deployer SA (PRD §6).

## Definition of done
A CI job authenticates to GCP via WIF and runs an authenticated call successfully, with no key material stored.

## Dependencies
S1 (workflow), M01.4 (deployer SA + WIF resources). Required by S6, S7, S8.
