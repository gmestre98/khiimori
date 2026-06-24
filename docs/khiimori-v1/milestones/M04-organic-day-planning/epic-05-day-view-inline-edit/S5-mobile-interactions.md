# S5 — Mobile-first interactions (sheets, thumb zones)

## Context
The day view prioritises **thumb-reachable, low-friction add/edit and drag gestures** on mobile (PRD §5.3,
§5.10). This makes spontaneous changes fast on a phone — the milestone's headline requirement.

## Task
Optimise the day-view interactions for mobile.

## Acceptance criteria
- [x] Quick add/edit uses **sheets/drawers** reachable in the thumb zone on mobile.
- [x] Primary actions (add, status, move) have large tap targets in reachable positions.
- [x] Drag interactions are usable on touch, with non-drag fallbacks (controls/menus).
- [x] The layout adapts between a comfortable laptop view and a purpose-built mobile view (not a shrunk
  desktop).

## Constraints
- Adopt Milestone 09 mobile primitives (bottom nav, sheets) as they land; do not block on them — provide a
  reasonable interim.
- Keep parity of capability between web and mobile.

## Definition of done
The day view is genuinely usable on a phone for fast, spontaneous re-planning.

## Dependencies
S1–S4; aligns with Milestone 09 (mobile nav/sheets).
