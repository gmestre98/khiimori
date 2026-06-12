# S4 — Auto-save (debounced)

## Context
All changes **auto-save** with no explicit "save" button; in-flight saves are debounced and surfaced
subtly (PRD §5.3). This applies to inline edits (S2) and re-planning (S3).

## Task
Implement debounced auto-save for day-view edits with subtle status feedback.

## Acceptance criteria
- [ ] Edits **auto-save** without an explicit save action; rapid edits are **debounced** into efficient
  writes.
- [ ] Save state is surfaced **subtly** (e.g. saved / saving / retry) without nagging the user.
- [ ] Saves go through the same mutation layer Epic 06 wraps so behaviour is identical online and offline.
- [ ] Failed saves (online) are retried or clearly flagged without losing the user's input.

## Constraints
- Debounce per item/field to avoid write storms; coalesce where possible.
- Do not block the UI on saves (optimistic, reconcile with server/queue).

## Definition of done
Day-view edits auto-save with debouncing and subtle feedback, consistent with the offline mutation layer.

## Dependencies
S2, S3, Epic 06 (offline mutation layer). 
