# S3 — Conflict resolution (deterministic)

## Context
Conflicting edits (e.g. the same item changed on two devices, or server-side since the queue was built)
must resolve **deterministically** (PRD §6). v1 keeps the strategy simple but well-defined.

## Task
Define and implement a deterministic conflict-resolution strategy for replayed mutations.

## Acceptance criteria
- [ ] A documented strategy resolves conflicts deterministically (e.g. last-write-wins by timestamp, or
  field-level merge for independent fields) — chosen approach recorded.
- [ ] Reorders converge using the convergence-friendly `order` scheme (Epic 04 S1) rather than clobbering.
- [ ] A conflicting replay does not crash or silently lose data beyond the documented rule; the user can
  see the resulting state.
- [ ] A unit test exercises at least one conflict case and asserts the deterministic outcome.

## Constraints
- Keep it simple (PRD §7.0) — no CRDT framework in v1 unless justified; confirm any dependency with the
  author.
- The same strategy must work for Milestone 06 (Journal) since the mechanism is shared.

## Definition of done
Conflicts resolve deterministically per a documented rule; reorders converge; a conflict test is green.

## Dependencies
S1, S2, Epic 04 S1 (ordering). Shared with Milestone 06.
