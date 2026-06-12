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

## User stories

The epic is split into **3 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-token-layer.md) | Design token layer | ~3h | AC1, AC2 | M01.6 |
| [S2](S2-blackwhite-accent.md) | Black/white theme & restrained accent | ~2.5h | AC1, AC2 | S1 |
| [S3](S3-theme-preference-docs.md) | Theme preference application & token docs | ~2.5h | AC3, AC4 | S1, S2, M02 |

**Total:** ~8h (≈ 1–2 dev-days), consistent with the epic's ~1–2 dev-day estimate.

### Sequencing

```
S1 Token layer ── S2 Black/white theme & accent ── S3 Theme preference & docs
```

> Tokens/theme should land early so Milestones 02–08 consume them.
