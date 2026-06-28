# S3 — Performance measurement & < 1.5s validation

## Context
The **day view must be interactive in < 1.5s on a mid-range phone on 4G**, measured against real-ish
content and recorded, with a **repeatable method** so Milestone 10 can re-verify (PRD §6, §7.6).

## Task
Define a repeatable performance measurement and validate the day-view target.

## Acceptance criteria
- [x] A **repeatable measurement method** is documented (device/network profile — mid-range phone on 4G,
  the day-view scenario, what "interactive" means).
- [x] The **day view is measured interactive < 1.5s** against real-ish content; the result is **recorded**.
- [x] If the target isn't met, the gaps and the techniques applied (S2) to close them are documented.
- [x] The method is reusable by Milestone 10's non-functional verification.

## Constraints
- Measure against real-ish content (a populated day), not an empty page.
- Document the method so Milestone 10 reproduces it (PRD §7.6).

## Definition of done
A documented, repeatable measurement shows the day view interactive < 1.5s (or records the gap + plan),
reusable by Milestone 10.

## Dependencies
S2 (techniques), Milestones 04–07 (day-view content). Re-verified in Milestone 10 Epic 05.
