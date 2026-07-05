# S3 — CI-minutes watch & cost sign-off

## Context
**CI minutes** are watched against the **2,000-min free cap** (or the repo kept public) (PRD §8.4 #4), and
the cost/load review is a **release-gate** deliverable.

## Task
Check CI-minute usage and record the cost/load review sign-off.

## Acceptance criteria
- [x] **CI-minute usage** is measured against the 2,000-min free cap; if at risk, a mitigation is recorded
  (trim E2E / keep repo public) (PRD §8.4 #4). — Repo is **public** → GitHub Actions minutes free/unlimited.
- [x] The full cost/load checklist (S1 posture + S2 levers/playbook + CI minutes) is consolidated into a
  short **sign-off**.
- [x] Any cost risk discovered is recorded with a decision. — F1 (Maps hard cap not live) accepted/mitigated.
- [x] The sign-off confirms the project's cost posture is understood and within target before release.

> ✅ Done — see [S3-ci-minutes-signoff-SIGNOFF.md](S3-ci-minutes-signoff-SIGNOFF.md) (2026-07-05).

## Constraints
- This is a verification/sign-off deliverable (a checklist against PRD §8), not new infra.
- Keep the E2E suites (Epics 01–02) lean to respect CI minutes.

## Definition of done
CI-minute usage is checked and the cost/load review is signed off as a release gate.

## Dependencies
S1, S2, Epics 01–02 (E2E CI minutes). Gates v1 release.
