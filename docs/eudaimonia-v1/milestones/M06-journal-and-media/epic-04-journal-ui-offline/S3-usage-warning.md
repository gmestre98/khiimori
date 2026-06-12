# S3 — Per-trip usage display & cap warning

## Context
The UI **shows per-trip photo usage and warns as the 1 GB cap approaches**, and surfaces the server-side
**rejection message** clearly when the cap is hit (PRD §5.5, Epic 03).

## Task
Display per-trip photo usage with a near-cap warning and clear over-cap messaging.

## Acceptance criteria
- [ ] The UI shows **per-trip photo usage** (used vs. 1 GB) from Epic 03 S4.
- [ ] It **warns** as usage approaches the cap (e.g. a visible indicator/threshold).
- [ ] When an upload is **rejected** for exceeding the cap (Epic 03 S2), the server message is surfaced
  clearly with guidance (delete photos / it won't upload).
- [ ] The displayed figure matches the server's enforced usage (single source of truth).

## Constraints
- Do not re-implement the cap client-side — display the server's figure and rejection (PRD §8.4).
- Keep the warning informative, not alarming.

## Definition of done
Users see their per-trip photo usage, get a near-cap warning, and clear messaging when over the cap.

## Dependencies
S2, Epic 03 (usage/cap). 
