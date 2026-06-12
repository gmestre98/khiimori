# S2 — Inline quick add/edit

## Context
**Inline add/edit** must be a couple of taps — adding a spontaneous activity is as easy as journaling
(PRD §5.3). Title-only quick add, expand for optional fields. Builds on the day view (S1) and Epic 02's
create/edit.

## Task
Implement inline quick add and inline edit for plan items in the day view.

## Acceptance criteria
- [ ] A **quick add** captures a title in a tap or two and creates an (untimed) plan item on the day
  (Epic 02 S2).
- [ ] An expandable form reveals optional fields (type, time, duration, location, booking, link, cost)
  without leaving the day view.
- [ ] **Inline edit** updates a field in place (Epic 02 S3) and reflects immediately.
- [ ] Quick add to the **backlog** (no day) is also possible.

## Constraints
- Keep the default path frictionless (title only); optional fields are progressive disclosure.
- Writes go through the mutation layer Epic 06 wraps for offline (consistent online/offline behaviour).

## Definition of done
Users can add and edit plan items inline in a couple of taps from the day view.

## Dependencies
S1, Epic 02 (create/edit), Epic 03 (backlog). Auto-save in S4.
