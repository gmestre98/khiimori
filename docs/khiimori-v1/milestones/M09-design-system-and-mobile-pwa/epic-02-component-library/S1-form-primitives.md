# S1 — Form & input primitives

## Context
The component library provides shared **buttons, inputs, and forms** built on Epic 01's tokens, with
accessibility baked in (PRD §5.10). These are reused by Milestones 02/03/08 forms.

## Task
Build the form/input primitives (buttons, text inputs, selects, form layout).

## Acceptance criteria
- [ ] Button variants (primary/secondary/destructive) and input controls (text, select, etc.) are
  implemented, **token-driven** (no hardcoded colours).
- [ ] Form layout primitives support label/field/error patterns used across the app.
- [ ] Accessibility is built in (focus states, labels, semantic markup).
- [ ] Primitives are reusable (props-driven) and documented enough for feature epics to consume.

## Constraints
- Confirm any third-party component dependency with the author before adding it (project rule); prefer a
  small footprint (PRD §7.0).
- Consume Epic 01 tokens; do not hardcode theme values.

## Definition of done
Reusable, accessible, token-driven form/input primitives exist for feature epics to use.

## Dependencies
Epic 01 (tokens). Consumed by Milestones 02/03/08; documented in S4.
