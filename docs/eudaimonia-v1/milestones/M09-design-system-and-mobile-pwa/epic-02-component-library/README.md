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

## User stories

The epic is split into **4 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-form-primitives.md) | Form & input primitives | ~3.5h | AC1, AC3, AC4 | Epic 01 |
| [S2](S2-layout-feedback-primitives.md) | Layout & feedback primitives (lists, sheets, progress bars) | ~3.5h | AC1, AC3, AC4 | Epic 01 |
| [S3](S3-navigation-primitives.md) | Navigation primitives | ~2.5h | AC1, AC4 | Epic 01, M03 |
| [S4](S4-component-docs.md) | Component documentation & a11y baseline | ~3h | AC2, AC3 | S1–S3 |

**Total:** ~12.5h (≈ 2–3 dev-days), consistent with the epic's ~2–3 dev-day estimate.

### Sequencing

```
S1 Form primitives ──┐
S2 Layout/feedback ──┼─ S4 Documentation & a11y baseline
S3 Navigation ───────┘
```
