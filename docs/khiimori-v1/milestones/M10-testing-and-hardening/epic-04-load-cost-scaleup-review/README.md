# Epic M10.4 — Load/cost review & scale-up playbook

> Milestone: [10 — Testing & Hardening](../README.md) · PRD refs: §8.4, §8.5, §8.6.

> **Status:** ✅ Done — 2026-07-05. Stories S1–S3 merged
> ([#419](https://github.com/gmestre98/khiimori/pull/419),
> [#420](https://github.com/gmestre98/khiimori/pull/420),
> [#421](https://github.com/gmestre98/khiimori/pull/421)). All 5 epic ACs met via
> live verification of the `dev` stack: idle ≈€0/mo with scale-to-zero
> (`scaleToZeroActive=true`), €10 billing budget + 50/90/100% alerts and the Maps
> server key restriction confirmed live, every scale-up lever confirmed
> config-only (the Cloud Run `minInstances` lever exercised as a single revision
> update and reverted), mobile dashboards/runbook reused from M01.8, and CI
> minutes carry no risk (public repo → unlimited). One low finding
> (F1 — Maps hard quota cap not live, `enableMapsQuotaCap` off) accepted &
> mitigated (key restriction + budget + free-tier headroom); recorded in the
> [S3 sign-off](S3-ci-minutes-signoff-SIGNOFF.md). No release-blockers.

## Description

The cost-verification epic. Run a light **load/cost review** confirming the project's **≈€0–3/mo idle**
posture, that each **scale-up lever works as a single setting** (Neon tier, Cloud Run
`min-instances`, Maps quota), and that the **mid-trip scale-up playbook** is real: dashboards
reachable from mobile, scale-up effective in minutes with no redeploy/migration. Confirm Maps caps +
billing budget/alert are active, and watch CI minutes against the free cap.

**Estimated effort:** ~1–2 developer-days (one developer).

## Acceptance Criteria

- [x] A light **load/cost review** confirms the expected **≈€0–3/mo idle** posture and that scale-up
      levers (**Neon tier, Cloud Run `min-instances`, Maps quota**) work as **single settings**
      (PRD §8.6). — [S1](S1-cost-posture-review-REPORT.md), [S2](S2-scaleup-playbook-REPORT.md)
- [x] The **mid-trip scale-up playbook** is validated: **dashboards reachable from mobile**, scale-up
      **effective in minutes with no redeploy/migration** (PRD §8.6). — [S2](S2-scaleup-playbook-REPORT.md)
- [x] **Maps key restricted with hard quota caps** and **GCP billing budget + alert active** are
      verified **live** (PRD §8.5). — key restriction + budget/alert live; hard cap not live (F1,
      mitigated) — [S1](S1-cost-posture-review-REPORT.md)
- [x] **Scale-to-zero** is confirmed for the stateless services, and the DB scale-up lever (Neon
      free → paid) is confirmed config-only (PRD §8.4 #1, §8.6). — [S1](S1-cost-posture-review-REPORT.md)
- [x] **CI minutes** are watched against the **2,000-min free cap** (or the repo kept public)
      (PRD §8.4 #4). — public repo → unlimited free — [S3](S3-ci-minutes-signoff-SIGNOFF.md)

## Implementation Details / Architecture

- A **checklist review** against PRD §8: confirm scale-to-zero, billing alert, Maps caps, and that
  each scale-up lever is **config-only** (PRD §8.5–8.6) — not a code change.
- The playbook is **exercised**, not just documented: flip a lever (e.g. Cloud Run `min-instances`),
  confirm the effect, flip it back — proving the mid-trip story from a phone (PRD §8.6).
- Reuses the **mobile dashboards/runbook** from Milestone 01's cost-guardrails epic as the operator's
  entry point.

## Dependencies

- **Upstream:** Milestone 01 (billing budget/alert, Maps caps, scale tunables, dashboards/runbook),
  Milestone 07 (Maps usage), Milestone 03 (Neon DB).
- **Downstream:** a release gate — the author depends on this posture mid-trip.

## Costs Impact

This epic **verifies** the project's cost guardrails rather than adding cost: ≈€0–3/mo idle, billing
budget/alert live, Maps quota caps, scale-to-zero, single-setting scale-up levers (PRD §8.5–8.6).
**CI minutes** are the one running cost to watch (PRD §8.4 #4).

## Designs

No UI — a cost/operations review deliverable (PRD §8).

## User stories

The epic is split into **3 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-cost-posture-review.md) | Cost posture review (idle ≈€0–3/mo, guardrails live) | ~3h | AC1, AC3, AC4 | M01 Epic 08, M03, M07 |
| [S2](S2-scaleup-playbook.md) | Scale-up levers & mid-trip playbook validation | ~3.5h | AC1, AC2 | S1, M01 Epic 08 |
| [S3](S3-ci-minutes-signoff.md) | CI-minutes watch & cost sign-off | ~2h | AC5 | S1, S2, Epics 01–02 |

**Total:** ~8.5h (≈ 1–2 dev-days), consistent with the epic's ~1–2 dev-day estimate.

### Sequencing

```
S1 Cost posture review ── S2 Scale-up levers & playbook ── S3 CI-minutes watch & sign-off
```

> A release gate that **verifies** the cost guardrails (it adds no cost). S2 actually exercises a scale-up
> lever from mobile and reverts it.
