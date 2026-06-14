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
- [x] Confirmed Cloud Run `min-instances` defaults to **0** (`minInstances = cfg.getNumber('minInstances') ?? 0` in `tunables.ts`) — service scales to zero when idle.
- [x] Confirmed Neon free-tier autosuspend is in effect (suspends after ~5 min idle, wakes on next query ~500 ms) — documented in `tunables.ts` comments.
- [x] Drift guard: `pulumi.log.warn` fires in `tunables.ts` whenever `minInstances > 0` — visible in every `pulumi up` / `pulumi preview` output.
- [x] Idle cost (≈€0) and cost-to-raise documented in `tunables.ts` comments and `scale-up-levers.md`; `scaleToZeroActive` stack output confirms posture at a glance.
- [x] No always-on resource introduced by this epic.

## Constraints
- This story **confirms and guards** defaults — it doesn't change the levers (those live in M01.4 S9).
- Keep verification cheap; no load testing here.

## Definition of done
Documented confirmation (with a drift check) that Cloud Run + Neon idle at ≈€0 by default.

## Dependencies
M01.4 S9 (scale tunables), M01.3 (Neon). Satisfies epic AC3.
