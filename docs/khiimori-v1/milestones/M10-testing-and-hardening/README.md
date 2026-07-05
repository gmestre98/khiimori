# Milestone 10 — Testing & Hardening

> End-to-end critical-journey tests, non-functional verification, a security & privacy review, and a
> load/cost review — the quality gate that makes v1 dependable while travelling abroad. Continuous,
> but also the release gate.
>
> PRD refs: §6 (all NFRs), §7.5–7.6, §8.4–8.6.

> **Status:** ✅ Done — 2026-07-05. All 5 epics complete (E2E harness & critical journey,
> role/offline E2E, security & privacy review, load/cost review & scale-up playbook,
> non-functional verification). Release gate **PASS**: no release-blockers; low findings
> accepted & mitigated. v1 quality gate met.

---

## Milestone goal

Bring v1 up to a **shippable, dependable** bar. Unit/integration tests are built *within* each
feature milestone; this milestone owns the **cross-cutting end-to-end journeys**, the
**non-functional verification** (performance, availability, offline, observability), the **security
& privacy review**, and a **load/cost review** before the author depends on the app mid-trip. The
critical journey — **sign in → create trip → plan a day → add budget → write journal → share trip**
— runs green in CI against a staging environment, role-based access and offline sync are exercised
end-to-end, and the project's cost guardrails (billing alert, Maps caps, scale-to-zero, single-setting
scale-up levers) are verified live.

## Milestone-level Definition of Done

- The **critical journey** runs green in CI against a **preview/staging** environment, and E2E
  covers **role-based access** (Editor edits, Viewer read-only, non-member denied) and **offline →
  online sync** for journal and plan edits (PRD §7.5–7.6, §5.9, §6).
- **Non-functional verification** is recorded: day view **interactive < 1.5s on a mid-range phone on
  4G**, graceful read-only/offline behaviour under poor network, and **error alerting confirmed to
  reach the author while abroad** (PRD §6).
- A **security & privacy review** confirms **authorization on every trip-scoped endpoint** (no
  endpoint trusts the client), trips/photos/journals **visible only to owner + invited members**,
  and **OAuth/Maps secrets never reaching the client** (PRD §5.9, §6, §8.5).
- A **load/cost review** confirms the **≈€0–3/mo idle** posture, that scale-up levers (Neon tier,
  Cloud Run `min-instances`, Maps quota) work as **single settings**, the **mid-trip scale-up
  playbook** is validated, **Maps caps + billing budget/alert are active**, and **CI minutes** are
  watched against the free cap (PRD §8.4–8.6).

## Epics in this milestone

| Epic | Title | AC | Est. (dev-days) | Cost-relevant |
|------|-------|----|-----------------|---------------|
| [01](epic-01-e2e-harness-critical-journey/README.md) | E2E harness & critical journey (CI vs staging) | 4 | ~2–3 | yes (CI minutes) |
| [02](epic-02-role-access-offline-e2e/README.md) | Role-based access & offline-sync E2E | 4 | ~2 | — |
| [03](epic-03-security-privacy-review/README.md) | Security & privacy review | 4 | ~2 | yes (verifies key/secret posture) |
| [04](epic-04-load-cost-scaleup-review/README.md) | Load/cost review & scale-up playbook | 5 | ~1–2 | yes (the cost-verification epic) |
| [05](epic-05-nonfunctional-verification/README.md) ✅ | Non-functional verification (perf, availability, observability) | 4 | ~1–2 | — |
| | **Milestone total** | **21** | **~8–11** (≈ 2–2.5 weeks, one developer) | — |

> **Estimates** assume one developer familiar with the stack. This milestone is **continuous** (its
> suites run alongside Milestones 02–09) and also a **release gate** — the E2E suite and reviews
> firm up as features land, then gate the release.

## Sequencing within the milestone

```
01 E2E harness & critical journey ── 02 Role-access & offline-sync E2E
03 Security & privacy review ─┐
04 Load/cost & scale-up review ├─ (run as features stabilise; gate before release)
05 Non-functional verification ┘
```

## Designs

No new UI. Validates that the implemented screens match the directional concepts (PRD §4) and meet
the accessibility/performance bars of Milestone 09 (PRD §5.10, §6).
