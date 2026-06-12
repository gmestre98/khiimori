# Epic M09.1 — Design tokens & theming (black/white + accent)

> Milestone: [09 — Design System & Mobile/PWA](../README.md) · PRD refs: §5.10, §7.0, §7.2.

## Description

Establish the **design tokens** — colours, typography, spacing — that drive the whole app. The
default theme is **minimal black & white** with a **single configurable accent** reserved for
status, budget bars, and map pins. Theming is **token-driven so the whole app can be re-skinned by
editing tokens**, keeping post-v1 restyling cheap. This is the foundation Epic 02's components and
every feature screen consume.

**Estimated effort:** ~1–2 developer-days (one developer).

## Acceptance Criteria

- [ ] **Design tokens** (colours, typography, spacing) implement the **black/white theme** with a
      **single accent** reserved for **status, budget bars, and map pins** (PRD §5.10).
- [ ] Theming is **token-driven**: changing the palette/type in one place re-skins the app, so
      post-v1 restyling is cheap (PRD §5.10 "designed to evolve", §7.2).
- [ ] The theme respects the user's **theme preference** (from the Milestone 02 profile) where
      applicable, and a default is defined.
- [ ] Tokens are **documented** so feature epics use them instead of hardcoded values (PRD §5.10).

## Implementation Details / Architecture

- Part of the **`/web` React + TypeScript** app (PRD §7.2). Token implementation favours easy theming
  and a small footprint (CSS variables / a lightweight token layer) — fewest moving parts (PRD §7.0).
- Accent usage is **restrained by design**: tokens make it easy to apply accent only to the three
  sanctioned cases (status, budget bars, map pins) (PRD §5.10).
- Theme preference plumbing connects to Milestone 02's `prefs` so a user's choice is honoured.

## Dependencies

- **Upstream:** Milestone 01 (web app shell). Can start early.
- **Downstream:** Epic 02 (components built on tokens) and every feature screen (Milestones 02–08).

## Costs Impact

No infra cost (PRD §8.1).

## Designs

Directional palette/typography across all mockups
([assets/01](../../../assets/01-trips-dashboard.svg), [02](../../../assets/02-day-plan-map.svg),
[03](../../../assets/03-mobile-and-sharing.svg)) (PRD §4, §5.10).
