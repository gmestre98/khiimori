# S9 — Placeholder e2e stage against staging

> **Status:** ✅ Done — placeholder e2e smoke stage hits the deployed env; M10 extends (#127).

## Context
The pipeline needs an **e2e stage wired against a preview/staging environment** now, even though the actual
journeys are authored in Milestone 10 (PRD §7.5, §7.6). This story adds the stage shell — environment
targeting, a trivial smoke check, and the gate — so Milestone 10 only has to drop in tests.

Assumes the deploy stages (**S7**, **S8**) exist so there's a running target to point at.

## Task
Add a placeholder e2e stage that targets a staging/preview environment and runs a trivial smoke check.

## Acceptance criteria
- [x] An e2e stage exists in the pipeline, runnable after deploy, targeting a **staging/preview** URL from config (not prod).
- [x] It runs a **trivial smoke check** today (e.g. hit `/healthz` and load the web shell) and passes.
- [x] The stage is structured so Milestone 10 can add the critical-journey tests without re-plumbing
  (env vars, base URLs, and a clear place for specs are in place).
- [x] It can be made **required** later; for now it gates on the smoke check and is clearly marked a placeholder.
- [x] Documented: how Milestone 10 will fill in the real journeys.

## Constraints
- Keep it cheap (CI minutes — PRD §8.4 #4); no heavy browser matrix yet.
- Don't fake a pass — the smoke check must actually exercise the deployed environment.

## Definition of done
The pipeline has an e2e stage hitting staging with a real smoke check, ready for Milestone 10 to extend.

## Dependencies
S7 (Cloud Run deploy), S8 (web deploy). Downstream: Milestone 10 fills the journeys.
