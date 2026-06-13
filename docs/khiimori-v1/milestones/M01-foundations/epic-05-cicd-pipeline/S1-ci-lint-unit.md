# S1 — CI workflow: lint + unit tests on every change

> **Status:** ✅ Done — lint + unit gate (Go + web) runs on every push/PR (#119).

## Context
Every change must pass `lint → unit tests` before it can land (PRD §7.5). This story creates the base
GitHub Actions workflow that runs the existing Go and web lint/format checks (M01.1 S6/S7) and the unit
test suites (M01.2, etc.) on every push/PR — the gate the rest of the pipeline builds on.

Assumes the repo, linters, and unit tests from M01.1/M01.2 exist.

## Task
Add a GitHub Actions workflow that runs Go + web lint and unit tests on every push and pull request.

## Acceptance criteria
- [x] A workflow triggers on PRs and pushes to `main`, running both backend (Go) and web (TS) jobs.
- [x] It runs the **existing** lint/format checks (M01.1 S6/S7) and `go test ./...` + the web unit tests.
- [x] Go and Node toolchains are pinned to the repo's versions; dependency caching is enabled for speed.
- [x] A failing lint or unit test **fails the check** (branch-protection-ready, gating the change).
- [x] Jobs run in parallel where independent to keep wall-clock + CI minutes down.

## Constraints
- Reuse existing lint/test commands — don't reinvent them in YAML (PRD §7.0).
- Watch CI minutes (PRD §8.4 #4): cache deps, avoid redundant matrix runs.

## Definition of done
Opening a PR runs lint + unit tests for backend and web; a deliberate lint/test failure blocks the check.

## Dependencies
M01.1 (lint), M01.2 (unit tests). Upstream of every other epic-05 story.
