# S2 — Fast "add cost" affordance

## Context
Logging a cost must be roughly the effort of adding a plan item — a **fast "add cost" affordance**
reachable from the day view (PRD §5.4). Drives Epic 02's `CostEntry` create.

## Task
Build a fast add-cost affordance in the day view.

## Acceptance criteria
- [ ] A fast affordance (reachable from the day view) creates a `CostEntry` in a tap or two: category,
  amount, optional note, optional day/plan-item link (Epic 02 S2).
- [ ] Defaults minimise friction (e.g. prefilled day, sensible category) so a spontaneous spend is logged
  quickly.
- [ ] Amounts are **EUR** only.
- [ ] The affordance sits next to the day's plan list (consistent with the planning add flow).

## Constraints
- Match the low-friction feel of Milestone 04's plan-item quick add.
- Writes go through the shared offline mutation layer (S3).

## Definition of done
A cost can be logged from the day view in a tap or two, in EUR.

## Dependencies
M04 Epic 05 (day view), Epic 02 (CostEntry). Auto-save/offline in S3.
