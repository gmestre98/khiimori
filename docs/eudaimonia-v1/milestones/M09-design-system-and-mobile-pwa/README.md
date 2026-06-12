# Milestone 09 — Design System & Mobile/PWA Polish

> The minimal black/white theme and component library, a genuinely usable responsive + installable
> (PWA) mobile experience, accessibility, and a performance budget — the shared UI foundation every
> screen reuses.
>
> PRD refs: §5.10, §6 (Performance, Offline), §7.2 (React/TS, PWA).

---

## Milestone goal

Establish the **look, feel, and front-end foundations** the whole app shares. The default theme is
**minimal black & white**, with **restrained accent colour** only where it adds clarity (status,
budget bars, map pins). Layouts are simple and uncluttered. The app is **genuinely responsive** — a
comfortable laptop layout and a real **mobile layout** (bottom nav, thumb-reachable actions), not a
shrunk desktop — and **installable as a PWA** that is **offline-capable**, with the service worker
coordinating the **offline write queue** shared with Planning (04) and Journal (06). Accessibility
and a measured **performance budget** (day view interactive < 1.5s on a mid-range phone on 4G) are
baked in. The system is **tokenised so post-v1 restyling is cheap**. This milestone can start early
(foundation) and polishes late, running alongside Milestones 03–08.

## Milestone-level Definition of Done

- A **component library + design tokens** implement the **black/white theme** (accent reserved for
  status, budget bars, map pins) and are **easy to re-theme** by editing tokens (PRD §5.10, §7.2).
- **Responsive layouts**: a comfortable laptop layout and a **purpose-built mobile layout** with
  **bottom navigation and thumb-reachable actions** — not a scaled-down desktop (PRD §5.10).
- The app is an **installable PWA** (manifest, service worker, icons) that launches standalone and is
  **offline-capable** (app shell + current-trip viewing), with the service worker coordinating the
  **offline write queue** used by Milestones 04 and 06 (PRD §6, §7.2).
- **Accessibility** (keyboard nav, sufficient contrast, readable type) and the **performance target**
  (day view interactive < 1.5s on a mid-range phone on 4G) are met and validated (PRD §5.10, §6).
- Shared primitives (buttons, lists, forms, sheets/drawers, progress bars, nav) are **documented and
  reused** by Milestones 02–08 rather than re-implemented per screen (PRD §5.10).

## Epics in this milestone

| Epic | Title | AC | Est. (dev-days) | Cost-relevant |
|------|-------|----|-----------------|---------------|
| [01](epic-01-design-tokens-theming/README.md) | Design tokens & theming (black/white + accent) | 4 | ~1–2 | — |
| [02](epic-02-component-library/README.md) | Core component library | 4 | ~2–3 | — |
| [03](epic-03-responsive-mobile-nav/README.md) | Responsive layouts & mobile navigation | 4 | ~2 | — |
| [04](epic-04-pwa-offline-shell/README.md) | PWA installability & offline shell | 5 | ~2–3 | — |
| [05](epic-05-accessibility-performance/README.md) | Accessibility & performance budget | 4 | ~1–2 | yes (indirectly cost-positive) |
| | **Milestone total** | **21** | **~8–12** (≈ 2–2.5 weeks, one developer) | — |

> **Estimates** assume one developer familiar with the stack; they cover implementation, tests, and
> review. Tokens + components (Epics 01–02) should land early so Milestones 02–08 consume them; PWA,
> a11y, and performance (Epics 04–05) polish late. The service worker / offline shell (Epic 04) is
> **co-owned with Milestones 04 and 06** so there is one offline mechanism.

## Sequencing within the milestone

```
01 Design tokens & theming ── 02 Core component library ──┬─ 03 Responsive & mobile navigation
                                                          ├─ 04 PWA & offline shell (co-owned w/ M04, M06)
                                                          └─ 05 Accessibility & performance budget
```

## Designs

This milestone **implements** the directional concepts across all mockups:
- Trips dashboard: [assets/01-trips-dashboard.svg](../../assets/01-trips-dashboard.svg) (PRD §4.1)
- Day plan + map: [assets/02-day-plan-map.svg](../../assets/02-day-plan-map.svg) (PRD §4.2)
- Mobile + sharing: [assets/03-mobile-and-sharing.svg](../../assets/03-mobile-and-sharing.svg) (PRD §4.3)

The mockups are **directional, not final** (PRD §4); this milestone produces the real, accessible,
themeable components and is expected to iterate on user feedback after v1 (PRD §5.10).
