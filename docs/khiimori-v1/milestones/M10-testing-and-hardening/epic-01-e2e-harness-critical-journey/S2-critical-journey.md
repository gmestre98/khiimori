# S2 — Critical-journey E2E test

## Context
The **critical journey** must run green: **sign in → create trip → plan a day → add budget → write journal
→ share trip** (PRD §7.6). This is the headline end-to-end proof the app works across all modules.

## Task
Implement the critical-journey E2E test on the harness (S1).

## Acceptance criteria
- [ ] One E2E test covers the full journey: **sign in → create trip → plan a day (add a plan item) → add a
  budget (set/log a cost) → write a journal entry → share the trip (invite)**.
- [ ] Each step asserts a real outcome (data persisted / visible), not just a click.
- [ ] The test runs against staging via the S1 harness and is deterministic (stable selectors, test
  data cleanup).
- [ ] The journey passes green locally against staging.

## Constraints
- Use stable, accessible selectors (aligns with Milestone 09 a11y).
- Clean up test data (or use disposable test identities/trips) so reruns are reliable.

## Definition of done
The critical journey runs green end-to-end against staging.

## Dependencies
S1 (harness), Milestones 02–08 (the journey's steps). CI gating in S3.
