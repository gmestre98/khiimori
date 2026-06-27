# S3 — Sheets/drawers for quick add/edit

## Context
**Sheets/drawers** support quick add/edit interactions, enabling Milestone 04's low-friction add/edit
(PRD §5.3, §5.10). This composes Epic 02's sheet primitive into the mobile layout.

## Task
Integrate sheets/drawers for quick add/edit into the responsive layout.

## Acceptance criteria
- [x] Sheets/drawers (Epic 02 S2) are composed into the mobile layout for quick add/edit flows.
- [x] They are thumb-reachable and dismissible, suitable for Milestone 04's plan-item/cost quick add.
- [x] On laptop, the equivalent affordance (modal/inline) is provided so capability parity holds.
- [x] The interaction is accessible (focus trapping, keyboard dismiss).

## Constraints
- Reuse Epic 02's sheet primitive; this story is composition into layouts, not new primitives.
- Keep parity of capability between mobile and laptop.

## Definition of done
Quick add/edit sheets are integrated into the mobile layout (with a laptop equivalent), ready for
Milestone 04.

## Dependencies
S1, S2, Epic 02 S2 (sheets). Consumed by Milestones 04/05.
