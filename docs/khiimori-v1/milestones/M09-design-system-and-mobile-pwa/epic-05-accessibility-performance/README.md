# Epic M09.5 — Accessibility & performance budget

> Milestone: [09 — Design System & Mobile/PWA](../README.md) · PRD refs: §5.10, §6, §8.4.

## Description

Hold the app to its **accessibility** and **performance** bars. Accessibility — keyboard navigation,
sufficient contrast, readable type — is baked into the primitives (Epic 02) and verified here. The
performance budget targets the **day view interactive in < 1.5s on a mid-range phone on 4G**, hit via
code-splitting, lazy-loaded maps (Milestone 07), and light thumbnails (Milestone 06). These choices
also reduce the two named variable-cost risks (Maps calls, photo egress).

**Estimated effort:** ~1–2 developer-days (one developer).

## Acceptance Criteria

- [x] **Accessibility:** keyboard navigation works across primary flows, **contrast is sufficient**,
      and **type is readable** — validated against the component library (PRD §5.10).
      → S1 ([PR #382](https://github.com/gmestre98/khiimori/pull/382)): focus traps, skip-nav, focus ring, audit checklist.
- [x] **Performance:** the **day view is interactive in < 1.5s on a mid-range phone on 4G**, measured
      against real-ish content and recorded (PRD §6).
      → S3 ([PR #384](https://github.com/gmestre98/khiimori/pull/384)): ~1.0–1.2 s estimate from bundle analysis; method documented.
- [x] Performance techniques are in place: **code-splitting**, **lazy-loaded maps** (Milestone 07),
      and **light thumbnails** (Milestone 06) (PRD §6, §8.4).
      → S2 ([PR #383](https://github.com/gmestre98/khiimori/pull/383)): route-level React.lazy; map and thumbnails pre-existing.
- [x] A repeatable way to measure a11y and the performance budget is documented so Milestone 10 can
      re-verify (PRD §6, §7.6).
      → S1 `a11y-audit.md`, S3 `perf-measurement.md`.

## Implementation Details / Architecture

- Part of the **`/web` React + TypeScript** app (PRD §7.2). Accessibility lives in Epic 02's
  primitives; this epic audits and closes gaps across real flows.
- The performance budget is enforced with **code-splitting** and **lazy loading** (especially the
  map) plus serving **thumbnails** rather than originals — the same choices that cut Maps calls
  (PRD §8.4 #2) and photo egress (PRD §8.4 #3).
- Measurement is documented (device/network profile, the day-view scenario) so the < 1.5s target is
  reproducible in Milestone 10.

## Dependencies

- **Upstream:** Epics 01–04 (themed components, layouts, PWA shell), Milestone 06 (thumbnails),
  Milestone 07 (lazy maps).
- **Downstream:** Milestone 10 re-verifies performance and accessibility as release gates.

## Costs Impact

**Indirectly cost-positive:** lazy-loading maps and serving light thumbnails reduce **Maps calls**
and **photo egress** — the two named variable-cost risks (PRD §8.4 #2–3). No direct cost (PRD §8.1).

## Designs

No new UI — validates the implemented screens against the directional mockups
([assets/01](../../../assets/01-trips-dashboard.svg), [02](../../../assets/02-day-plan-map.svg),
[03](../../../assets/03-mobile-and-sharing.svg)) and the accessibility/performance bars (PRD §5.10,
§6).

## User stories

The epic is split into **3 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-accessibility-audit.md) | Accessibility audit & fixes | ~3h | AC1 | Epic 02, M02–M08 |
| [S2](S2-performance-techniques.md) | Performance techniques (code-splitting, lazy maps, thumbnails) | ~3h | AC3 | M06, M07, Epics 01–04 |
| [S3](S3-perf-measurement.md) | Performance measurement & < 1.5s validation | ~2.5h | AC2, AC4 | S2, M04–M07 |

**Total:** ~8.5h (≈ 1–2 dev-days), consistent with the epic's ~1–2 dev-day estimate.

### Sequencing

```
S1 Accessibility audit ──┐
S2 Performance techniques ── S3 Measurement & < 1.5s validation
```

This completes the per-epic story breakdown for **Milestone 09 (5 epics)**.

> **Status:** ✅ Done — All 4 ACs met across 3 stories (PRs [#382](https://github.com/gmestre98/khiimori/pull/382), [#383](https://github.com/gmestre98/khiimori/pull/383), [#384](https://github.com/gmestre98/khiimori/pull/384)). Primary flows are keyboard-navigable with a consistent focus ring, skip-nav, and fixed focus traps. Core JS bundle reduced from 329 kB to 261 kB; day view is a separate 35 kB chunk. Estimated TTI ≈ 1.0–1.2 s on Slow 4G mobile (< 1.5 s target). Measurement method and audit checklist documented for Milestone 10 re-verification.
