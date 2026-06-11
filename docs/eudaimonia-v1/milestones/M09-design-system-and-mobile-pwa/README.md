# Milestone 09 — Design System & Mobile/PWA Polish

**Status:** Milestone overview — to be split into focused epics (≤5 acceptance criteria each) following the [Milestone 01](../M01-foundations/README.md) pattern. The criteria below are the milestone-level spec and the source material for that split.

> The minimal black/white theme and component library, a genuinely usable responsive + installable
> (PWA) mobile experience, and accessibility — the shared UI foundation for every screen.
>
> PRD refs: §5.10, §6 (Performance, Offline), §7.2 (React/TS, PWA).

---

## Description

Establish the **look, feel, and front-end foundations** the whole app shares. The default theme is
**minimal black & white**, with **restrained accent colour** only where it adds clarity (status,
budget bars, map pins). Layouts are **simple and uncluttered** with few primary actions per
screen. The app is **genuinely responsive** — a comfortable laptop layout and a real mobile layout
(bottom nav, thumb-reachable actions), **not a shrunk desktop** — and **installable as a PWA**
that is **offline-capable**. The system is built to **evolve on real user feedback after v1**, so
components and theming are easy to tweak.

## Acceptance Criteria

- [ ] A **component library + design tokens** implement the **black/white theme** with accent
      colour reserved for **status, budget bars, and map pins** (PRD §5.10).
- [ ] **Theming is easy to change** (tokenised colours/typography) so post-v1 restyling is cheap
      (PRD §5.10 "designed to evolve", §7.2).
- [ ] **Responsive layouts**: a comfortable laptop layout and a **purpose-built mobile layout**
      with **bottom navigation and thumb-reachable primary actions** — not a scaled-down desktop
      (PRD §5.10).
- [ ] The app is an **installable PWA** (manifest, service worker, icons) and launches standalone
      on a phone (PRD §7.2).
- [ ] The PWA is **offline-capable**: app shell and current-trip viewing work offline; the service
      worker coordinates with the **offline write queue** used by Journal (06) and Planning (04)
      (PRD §6 Offline).
- [ ] **Accessibility:** keyboard navigation, sufficient contrast, readable type (PRD §5.10).
- [ ] **Performance target:** the day view is **interactive in < 1.5s on a mid-range phone on 4G**
      (PRD §6 Performance) — validated against real-ish content.
- [ ] Shared primitives (buttons, lists, forms, sheets/drawers, progress bars, nav) are documented
      and reused by Epics 02–08 rather than re-implemented per screen.

## Implementation Details / Architecture

- Part of the **`/web` React + TypeScript** app (PRD §7.2); one codebase serves laptop and mobile.
- **Design tokens** (colours, spacing, type) drive a small component library; black/white default
  with a single configurable accent — chosen so the whole app can be re-skinned by editing tokens
  (PRD §5.10, §7.2). Component-library/tooling choice should favour easy theming and small
  footprint (PRD §7.0 "fewest moving parts").
- **PWA:** web app manifest + service worker for installability and offline shell. The service
  worker's caching and the **offline write queue** are **co-owned with Epics 04 and 06** so there
  is **one** offline mechanism, not three (PRD §6, §7.0).
- **Mobile-first interaction model:** bottom nav, thumb zones, large tap targets, sheets for quick
  add/edit — these directly enable the "spontaneous changes are fast on mobile" requirement of
  Epic 04 (PRD §5.3, §5.10).
- **Performance budget:** code-splitting, lazy maps, and light thumbnails (from Epic 06) to hit the
  <1.5s day-view target on 4G (PRD §6).
- **Accessibility** baked into the primitives (focus states, contrast, semantic markup).

## Dependencies

- **Upstream:** Epic 01 (web app shell, hosting/CDN). Can start early in parallel.
- **Cross-cutting:** consumed by Epics 02–08 (every screen uses these components); **offline**
  bits are co-designed with Epics 04 and 06.
- **Downstream:** Epic 10 validates the performance and accessibility targets.

## Costs Impact

No direct infra cost. **Indirectly cost-positive:** lazy-loading maps and serving light
thumbnails reduce **Maps calls** (PRD §8.4 #2) and **photo egress** (PRD §8.4 #3), the two named
variable-cost risks. Hosting stays within the **Firebase Hosting free tier** (PRD §8.1).

## Designs

This epic **implements** the directional concepts across all mockups:
- Trips dashboard: [assets/01-trips-dashboard.svg](../assets/01-trips-dashboard.svg) (PRD §4.1)
- Day plan + map: [assets/02-day-plan-map.svg](../assets/02-day-plan-map.svg) (PRD §4.2)
- Mobile + sharing: [assets/03-mobile-and-sharing.svg](../assets/03-mobile-and-sharing.svg) (PRD §4.3)

The mockups are **directional, not final** (PRD §4); this epic produces the real, accessible,
themeable components and is expected to iterate on user feedback after v1 (PRD §5.10).
