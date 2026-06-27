# S4 — Component documentation & a11y baseline

## Context
Components must be **documented** (usage + variants) so feature epics **reuse rather than re-implement**
them, with accessibility baked into the primitives (PRD §5.10) — the foundation Epic 05 validates.

## Task
Document the component library and establish the accessibility baseline.

## Acceptance criteria
- [x] Each primitive (S1–S3) is **documented** with usage and variants (a simple component catalogue /
  reference, not necessarily a heavy tool).
- [x] An **accessibility baseline** is stated and met by the primitives (focus states, labels, semantic
  markup, contrast via tokens).
- [x] Feature epics have enough to **reuse** components without re-implementing (the docs are the contract).
- [x] A check/list confirms components consume tokens (no hardcoded theme values).

## Constraints
- Keep the catalogue lightweight; confirm any docs tooling dependency with the author (project rule).
- The a11y baseline here is what Epic 05 audits across real flows.

## Definition of done
The component library is documented with an a11y baseline, ready for reuse by Milestones 02–08.

## Dependencies
S1–S3, Epic 01 (tokens). Validated by Epic 05; consumed by all feature screens.
