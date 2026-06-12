# Epic M09.2 — Core component library

> Milestone: [09 — Design System & Mobile/PWA](../README.md) · PRD refs: §5.10, §7.0, §7.2.

## Description

Build the small **component library** of shared primitives — buttons, lists, forms, sheets/drawers,
progress bars, navigation — on top of Epic 01's tokens. These are **documented and reused** by
Milestones 02–08 rather than re-implemented per screen, with accessibility baked into the primitives
from the start. The library favours a small footprint and easy theming over a heavy framework.

**Estimated effort:** ~2–3 developer-days (one developer).

## Acceptance Criteria

- [ ] A **component library** provides the shared primitives — **buttons, lists, forms,
      sheets/drawers, progress bars, navigation** — built on Epic 01's tokens (PRD §5.10).
- [ ] Components are **documented** (usage + variants) so feature epics **reuse rather than
      re-implement** them (PRD §5.10).
- [ ] Accessibility is **baked into the primitives** (focus states, semantic markup, labels) — the
      foundation Epic 05 validates (PRD §5.10).
- [ ] Components are **theme-driven** (consume tokens, no hardcoded colours) so re-skinning via Epic
      01 flows through automatically (PRD §5.10, §7.2).

## Implementation Details / Architecture

- Part of the **`/web` React + TypeScript** app (PRD §7.2). Component-library/tooling choice favours
  **easy theming and small footprint** (PRD §7.0 "fewest moving parts") — confirm any third-party
  component dependency with the author before adding it (project rule: stdlib/first-party-first, ask
  before deps).
- Primitives are the building blocks for the budget bars (Milestone 05), sheets for quick add/edit
  (Milestone 04), and forms (Milestones 02/03/08) — designed against those real needs.

## Dependencies

- **Upstream:** Epic 01 (tokens). Can start early.
- **Downstream:** Milestones 02–08 (every screen), Epic 03 (layouts compose these), Epic 05 (a11y
  validation).

## Costs Impact

No infra cost (PRD §8.1).

## Designs

Primitives realise the directional mockups
([assets/01](../../../assets/01-trips-dashboard.svg), [02](../../../assets/02-day-plan-map.svg),
[03](../../../assets/03-mobile-and-sharing.svg)) (PRD §4, §5.10).
