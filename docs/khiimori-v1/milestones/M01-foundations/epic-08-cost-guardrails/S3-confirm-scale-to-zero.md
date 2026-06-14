# S3 — Confirm scale-to-zero defaults (Cloud Run + Neon)

> **Status:** ✅ Done — `minInstances=0` default confirmed in `tunables.ts` with a drift guard (`pulumi.log.warn` fires if raised above 0); Neon free-tier autosuspend behaviour documented in `tunables.ts` comments; `scaleToZeroActive` output in `index.ts` confirms idle-≈€0 posture at a glance. No always-on resource introduced by this epic.

## Context
The project's idle bill should be ≈€0, which depends on **scale-to-zero defaults** holding for both Cloud
Run and Neon (PRD §8.1, §8.6). M01.4 S9 set Cloud Run `min-instances=0`; this story verifies the whole
posture is actually idle-cheap and locks it in so a future change can't silently start charging.

Assumes the IaC stack with scale config (M01.4 S9) and Neon (M01.3) exist.

## Task
Verify and assert that Cloud Run and Neon default to scale-to-zero / idle-≈€0.

## Acceptance criteria
- [ ] Confirmed Cloud Run `min-instances` defaults to **0** (from M01.4 S9 config) — service scales to zero when idle.
- [ ] Confirmed Neon is on the **free tier** and its scale-to-zero/autosuspend behaviour is in effect (M01.3) — documented.
- [ ] A documented check (or lightweight IaC assertion/test) flags if `min-instances` or the Neon tier drift off the cheap defaults.
- [ ] The expected **idle cost (≈€0)** and what each non-zero setting would cost are written down (cross-link M01.4 S9).
- [ ] No always-on resource is introduced by this epic.

## Constraints
- This story **confirms and guards** defaults — it doesn't change the levers (those live in M01.4 S9).
- Keep verification cheap; no load testing here.

## Definition of done
Documented confirmation (with a drift check) that Cloud Run + Neon idle at ≈€0 by default.

## Dependencies
M01.4 S9 (scale tunables), M01.3 (Neon). Satisfies epic AC3.
