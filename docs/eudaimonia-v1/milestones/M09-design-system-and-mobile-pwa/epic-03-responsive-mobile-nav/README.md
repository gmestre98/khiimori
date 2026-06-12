# Epic M09.3 — Responsive layouts & mobile navigation

> Milestone: [09 — Design System & Mobile/PWA](../README.md) · PRD refs: §5.3, §5.10, §7.2.

## Description

Deliver **genuinely responsive** layouts: a comfortable laptop layout and a **purpose-built mobile
layout** with **bottom navigation and thumb-reachable primary actions** — not a scaled-down desktop.
The mobile interaction model (bottom nav, thumb zones, large tap targets, sheets for quick add/edit)
directly enables the "spontaneous changes are fast on mobile" requirement of Milestone 04.

**Estimated effort:** ~2 developer-days (one developer).

## Acceptance Criteria

- [ ] A **comfortable laptop layout** and a **purpose-built mobile layout** exist — the mobile layout
      is **not a scaled-down desktop** (PRD §5.10).
- [ ] The mobile layout uses **bottom navigation** and places **primary actions in thumb-reachable
      zones** with large tap targets (PRD §5.10).
- [ ] **Sheets/drawers** support quick add/edit interactions (enabling Milestone 04's low-friction
      add/edit) (PRD §5.3, §5.10).
- [ ] Layouts compose Epic 02's components and adapt across breakpoints without bespoke per-screen
      layout code (PRD §5.10, §7.2).

## Implementation Details / Architecture

- Part of the **`/web` React + TypeScript** app (PRD §7.2); **one codebase** serves laptop and mobile
  (PRD §7.2).
- The mobile-first interaction model (bottom nav, thumb zones, sheets) is the substrate Milestone 04's
  day view and Milestone 05's fast-cost affordance build on (PRD §5.3).
- Navigation structure aligns with Milestone 03's trip/day shell so feature screens slot in.

## Dependencies

- **Upstream:** Epic 02 (components), Milestone 03 (trip/day shell navigation).
- **Downstream:** Milestones 04–08 render inside these layouts; Epic 05 measures performance/a11y of
  them.

## Costs Impact

No infra cost (PRD §8.1).

## Designs

Mobile layout / bottom nav / thumb zones:
[assets/03-mobile-and-sharing.svg](../../../assets/03-mobile-and-sharing.svg) (PRD §4.3); laptop
layouts in [assets/01](../../../assets/01-trips-dashboard.svg) and
[02](../../../assets/02-day-plan-map.svg) (PRD §4.1–4.2).
