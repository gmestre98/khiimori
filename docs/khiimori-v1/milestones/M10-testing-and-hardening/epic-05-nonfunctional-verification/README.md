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

- [x] **Performance:** the **day view is interactive < 1.5s on a mid-range phone on 4G**, measured and
      recorded (PRD §6, Milestone 09). *(S1 — ≈ 1.0–1.3 s, [REPORT](S1-performance-verification-REPORT.md))*
- [x] **Availability/offline:** graceful **read-only/offline behaviour** under poor network is
      verified, and the **~99.5% API availability** target is understood and monitored (PRD §6).
      *(S2 — offline suite + live dashboard/alert, [REPORT](S2-availability-offline-REPORT.md))*
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

## User stories

The epic is split into **3 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-performance-verification.md) ✅ | Performance re-verification (< 1.5s day view) | ~2.5h | AC1 | M09 Epic 05 |
| [S2](S2-availability-offline.md) ✅ | Availability & offline behaviour verification | ~3h | AC2 | M04/M06/M09, M01 |
| [S3](S3-observability-alert.md) | Observability & alert-reaches-author-abroad verification | ~3h | AC3, AC4 | M01 Epic 07, Epic 01 |

**Total:** ~8.5h (≈ 1–2 dev-days), consistent with the epic's ~1–2 dev-day estimate.

### Sequencing

```
S1 Performance re-verification ──┐
S2 Availability & offline ───────┼─ S3 Observability/alert + consolidated release-gate summary
```

This completes the per-epic story breakdown for **Milestone 10 (5 epics)** — and for all of M02–M10.
