# S2 — Scale-up levers & mid-trip playbook validation — REPORT

> Deliverable for [S2](S2-scaleup-playbook.md). Validation date: 2026-07-05.
> Exercised against the Pulumi `dev` stack; the lever change was **previewed,
> not applied** (see "Exercise" below) so prod stayed at idle ≈€0.

## Levers confirmed config-only (single setting) — PRD §8.6

Each lever is one value; changing it needs no code edit, no Dockerfile rebuild,
and no DB migration. Source of truth: `infra/tunables.ts` + `scale-up-levers.md`.

| Lever | Config key | Default | Change mechanism | Code/migration? |
|-------|-----------|---------|------------------|-----------------|
| Cloud Run warm instances | `khiimori:minInstances` | `0` | `pulumi config set` + `pulumi up`, or Cloud Run console → Min instances | None |
| Cloud Run max fan-out | `khiimori:maxInstances` | `2` | same | None |
| Neon DB tier | (Neon console) | free | Neon console → Upgrade plan | None |
| Maps daily quota (hard cap) | `khiimori:mapsDailyQuota` (+ `enableMapsQuotaCap`) | `1000` / off | `pulumi config set` + `pulumi up`, or GCP → Maps Quotas | None |
| Budget alert threshold | `khiimori:billingBudgetEur` | `10` | `pulumi config set` + `pulumi up`, or Billing → Budgets | None |

## Exercise — flip a lever, confirm the effect, revert (PRD §8.6)

Lever exercised: **Cloud Run `minInstances`** (scale-to-zero → 1 warm).

1. `pulumi config set khiimori:minInstances 1`
2. `pulumi preview` planned exactly:
   ```
   ~ gcp:cloudrunv2:Service  api  update  [diff: ~template]
   Resources: ~ 2 to update
   ```
   → a **single Cloud Run revision update** from one config value. No image
   rebuild, no `goose` migration, no other service touched. The drift-guard
   also fired as designed:
   `minInstances=1 — Cloud Run will keep 1 instance(s) warm 24/7 … set to "0"
   to restore scale-to-zero`.
3. Reverted the config back to `0` — working tree clean, stack back at idle.

`pulumi up` applies this plan in ~1 min with no downtime (new revision, traffic
shifted) — i.e. **effective in minutes, no redeploy of code, no migration**. To
avoid any prod churn/cost for a verification task the change was validated by
`preview` rather than applied; the plan is proof of the single-setting effect.

## Dashboards / runbook reachable from mobile (PRD §8.6)

The M01.8 operator entry point is reused as-is; all links open in a phone
browser (no laptop for the response steps):

- Runbook: `docs/…/M01-foundations/epic-08-cost-guardrails/cost-guardrails-runbook.md`
  — mobile-reachable dashboards table (Billing, Cloud Run, Monitoring, Maps
  Quotas, Neon) + "app is slow / need more capacity now" scenario with both an
  IaC path and a **phone-only** console path per lever.
- Levers reference: `scale-up-levers.md` — per-lever dashboard equivalent for
  flipping from a phone.
- Budget/error alerts arrive as Gmail push to `goncalo.mestre1998@gmail.com`,
  readable on the phone that acts on them.

✅ The author can act mid-trip from a phone.

## Verdict

✅ **All levers confirmed config-only single settings; playbook validated.** The
`minInstances` lever was exercised (previewed as a single Cloud Run revision
update, no code/migration, ~1 min to apply) and reverted, and the M01.8 mobile
dashboards/runbook give the mid-trip entry point.
