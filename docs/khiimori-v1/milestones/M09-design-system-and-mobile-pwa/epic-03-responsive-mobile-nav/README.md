# Epic M09.3 — Responsive layouts & mobile navigation

> Milestone: [09 — Design System & Mobile/PWA](../README.md) · PRD refs: §5.3, §5.10, §7.2.

> **Status:** ✅ Done — all 4 epic ACs met across 3 story PRs
> ([#372](https://github.com/gmestre98/khiimori/pull/372) S1 responsive layout system,
> [#373](https://github.com/gmestre98/khiimori/pull/373) S2 mobile bottom nav & thumb zones,
> [#374](https://github.com/gmestre98/khiimori/pull/374) S3 quick add/edit sheets).
> One codebase now serves a comfortable laptop layout (persistent sidebar + centred content)
> and a purpose-built mobile layout (fixed bottom nav in the thumb zone + floating primary
> action), switched in CSS via `AppLayout`/breakpoints (`src/design/breakpoints.ts`). Quick
> add/edit composes `QuickActionDialog` — a bottom Sheet on mobile, a centred modal on laptop,
> both focus-trapped and keyboard-dismissible — ready for Milestone 04. See
> [`web/src/components/layout/LAYOUT.md`](../../../../../web/src/components/layout/LAYOUT.md).

## Description

Deliver **genuinely responsive** layouts: a comfortable laptop layout and a **purpose-built mobile
layout** with **bottom navigation and thumb-reachable primary actions** — not a scaled-down desktop.
The mobile interaction model (bottom nav, thumb zones, large tap targets, sheets for quick add/edit)
directly enables the "spontaneous changes are fast on mobile" requirement of Milestone 04.

**Estimated effort:** ~2 developer-days (one developer).

## Acceptance Criteria

- [x] A **comfortable laptop layout** and a **purpose-built mobile layout** exist — the mobile layout
      is **not a scaled-down desktop** (PRD §5.10).
- [x] The mobile layout uses **bottom navigation** and places **primary actions in thumb-reachable
      zones** with large tap targets (PRD §5.10).
- [x] **Sheets/drawers** support quick add/edit interactions (enabling Milestone 04's low-friction
      add/edit) (PRD §5.3, §5.10).
- [x] Layouts compose Epic 02's components and adapt across breakpoints without bespoke per-screen
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

## User stories

The epic is split into **3 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-responsive-layout-system.md) | Responsive layout system | ~3h | AC1, AC4 | Epic 02, M03 |
| [S2](S2-mobile-bottom-nav.md) | Mobile bottom navigation & thumb zones | ~3h | AC2 | S1, Epic 02 S3 |
| [S3](S3-sheets-quick-edit.md) | Sheets/drawers for quick add/edit | ~3h | AC3 | S1, S2, Epic 02 S2 |

**Total:** ~9h (≈ 2 dev-days), consistent with the epic's ~2 dev-day estimate.

### Sequencing

```
S1 Responsive layout system ── S2 Mobile bottom nav ── S3 Sheets for quick add/edit
```
