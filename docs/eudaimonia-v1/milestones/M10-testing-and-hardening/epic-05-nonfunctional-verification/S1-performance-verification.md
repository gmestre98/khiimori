# S1 — Performance re-verification (< 1.5s day view)

## Context
The **day view must be interactive < 1.5s on a mid-range phone on 4G**, measured and recorded (PRD §6,
Milestone 09). This story re-verifies it as a release gate using Milestone 09's documented method.

## Task
Re-measure the day-view performance against the < 1.5s target and record the result.

## Acceptance criteria
- [ ] The day view is measured **interactive < 1.5s on a mid-range phone on 4G**, using Milestone 09 S3's
  documented method (device/network profile, day-view scenario).
- [ ] The result is **recorded** (number + conditions) as a release-gate artifact.
- [ ] If the target is missed, the gap is documented with a remediation owner/plan.
- [ ] The measurement is run against real-ish content (a populated day), not an empty page.

## Constraints
- Reuse Milestone 09 S3's method for comparability — don't invent a new one.
- Record conditions so the result is reproducible.

## Definition of done
The < 1.5s day-view target is re-verified and recorded (or the gap is documented with a plan).

## Dependencies
Milestone 09 Epic 05 (perf method/budget), Milestones 04–07 (day-view content). Release gate.
