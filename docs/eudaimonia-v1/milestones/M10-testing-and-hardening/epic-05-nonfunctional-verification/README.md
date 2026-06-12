# Epic M10.5 — Non-functional verification (perf, availability, observability)

> Milestone: [10 — Testing & Hardening](../README.md) · PRD refs: §6, §7.6.

## Description

Verify the non-functional requirements that don't fit a single feature: **performance** (day view
interactive < 1.5s on a mid-range phone on 4G), **availability/offline** (graceful read-only/offline
behaviour under poor network; the ~99.5% API availability target understood and monitored), and
**observability** (centralised logs, basic metrics, and **error alerting confirmed to reach the
author while abroad**). These are measured and recorded as part of the release gate.

**Estimated effort:** ~1–2 developer-days (one developer).

## Acceptance Criteria

- [ ] **Performance:** the **day view is interactive < 1.5s on a mid-range phone on 4G**, measured and
      recorded (PRD §6, Milestone 09).
- [ ] **Availability/offline:** graceful **read-only/offline behaviour** under poor network is
      verified, and the **~99.5% API availability** target is understood and monitored (PRD §6).
- [ ] **Observability:** **centralised logs**, **basic metrics**, and **error alerting** are confirmed
      to **reach the author while abroad** (e.g. mobile-reachable channel) (PRD §6, Milestone 01).
- [ ] Results are **recorded** with a repeatable method so they can be re-verified before release
      (PRD §7.6).

## Implementation Details / Architecture

- **Performance** reuses Milestone 09's documented measurement method (device/network profile, the
  day-view scenario) so the < 1.5s target is reproducible (PRD §6).
- **Availability/offline** verification drives the PWA under throttled/again-offline conditions
  (Milestones 04/06/09) and checks monitoring is in place (PRD §6).
- **Observability** confirms Milestone 01's logging/metrics/alerting actually delivers an error alert
  to the author's mobile channel — the "alert reaches me abroad" requirement, end-to-end (PRD §6,
  Milestone 01 Epic 07).

## Dependencies

- **Upstream:** Milestone 09 (performance budget + measurement), Milestone 01 (observability/
  alerting), Milestones 04/06 (offline behaviour), Epic 01 (staging).
- **Downstream:** a release gate — recorded results gate v1.

## Costs Impact

Negligible direct cost — verification against existing scale-to-zero services and the free-tier
observability stack (PRD §8.1).

## Designs

No new UI — validates existing screens meet the accessibility/performance bars (PRD §5.10, §6).
