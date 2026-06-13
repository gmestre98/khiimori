# S1 — Accessibility audit & fixes

## Context
**Accessibility** — keyboard navigation, sufficient contrast, readable type — is baked into the primitives
(Epic 02) and verified here across real flows (PRD §5.10).

## Task
Audit the primary flows for accessibility and close gaps.

## Acceptance criteria
- [ ] **Keyboard navigation** works across primary flows (sign-in, trips, day planning, journal, sharing).
- [ ] **Contrast is sufficient** (token-driven) and **type is readable** at standard sizes.
- [ ] Focus states, labels, and semantic markup are correct on the primary flows (gaps from Epic 02 closed).
- [ ] An audit checklist/notes record what was checked and fixed.

## Constraints
- Build on Epic 02's a11y baseline; this is auditing real flows, not new primitives.
- Confirm any a11y-audit tooling dependency with the author (project rule).

## Definition of done
Primary flows pass an accessibility audit (keyboard, contrast, readable type) with gaps fixed.

## Dependencies
Epic 02 (a11y baseline), Milestones 02–08 (flows to audit). Re-verified in Milestone 10.
