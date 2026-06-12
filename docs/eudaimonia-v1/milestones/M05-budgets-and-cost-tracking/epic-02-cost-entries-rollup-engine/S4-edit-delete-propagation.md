# S4 — Edit/delete propagation & transactional consistency

## Context
Editing/deleting a **stay, plan item, or cost entry** must update the relevant roll-ups correctly, and the
math must be **consistent and transactional** (PRD §5.4, §9).

## Task
Ensure roll-ups reflect changes to any contributing source, consistently.

## Acceptance criteria
- [ ] Editing or deleting a `CostEntry` updates the affected category/day/trip roll-ups.
- [ ] Editing or deleting a **stay or plan item cost** (Milestone 04) is reflected in the roll-ups (since
  actuals are computed-on-read, this is automatic — verify and test it).
- [ ] Roll-up reads are **consistent** within a transaction/request (no torn totals).
- [ ] A unit/integration test edits and deletes each source type and asserts the roll-up changes.

## Constraints
- If actuals are computed-on-read (S3), propagation is inherent — the tests must prove it; if a cache is
  later introduced, it must invalidate on these changes.
- Cross-module cost reads stay behind the Trip interface.

## Definition of done
Roll-ups correctly and consistently reflect edits/deletes of stays, plan items, and cost entries; tests
green.

## Dependencies
S2, S3, Milestone 04 (cost sources). Tested broadly in S5.
