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

- [ ] **Accessibility:** keyboard navigation works across primary flows, **contrast is sufficient**,
      and **type is readable** — validated against the component library (PRD §5.10).
- [ ] **Performance:** the **day view is interactive in < 1.5s on a mid-range phone on 4G**, measured
      against real-ish content and recorded (PRD §6).
- [ ] Performance techniques are in place: **code-splitting**, **lazy-loaded maps** (Milestone 07),
      and **light thumbnails** (Milestone 06) (PRD §6, §8.4).
- [ ] A repeatable way to measure a11y and the performance budget is documented so Milestone 10 can
      re-verify (PRD §6, §7.6).

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
