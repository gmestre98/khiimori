# Scale-up levers — single settings (M01.8 S4)

> This document encodes the PRD §8.6 "run at ≈€0, scale up on demand with a
> single setting" plan. Each lever is one config value in the Pulumi stack
> (`infra/Pulumi.dev.yaml`) — a `pulumi config set` + `pulumi up` is all it
> takes. Dashboard equivalents let you flip the same lever from a phone
> without a laptop.

## Levers at a glance

| Lever | Config key | Default | `pulumi up` effect | Dashboard equivalent | Cost delta |
|-------|-----------|---------|---------------------|---------------------|------------|
| Cloud Run warm instances | `khiimori:minInstances` | `"0"` | One warm instance; no cold starts | Cloud Run → service → Edit & deploy → Min instances | ~€5–15/mo (always-on) |
| Cloud Run max fan-out | `khiimori:maxInstances` | `"2"` | Allows more concurrent requests | Cloud Run → service → Edit & deploy → Max instances | Scales with traffic |
| Neon DB tier | `khiimori:neonTier` (doc only) | `"free"` | Ref value; actual change in Neon console | Neon console → Project → Upgrade plan | ~€10–18/mo (Launch plan) |
| Maps daily quota (hard cap) | `khiimori:mapsDailyQuota` | `"1000"` | Updates the ConsumerQuotaOverride limit | GCP Console → APIs & Services → Maps JS API → Quotas | $7/1000 extra loads/mo |
| Monthly budget alert threshold | `khiimori:billingBudgetEur` | `"10"` | Raises the billing budget alert amount | GCP Console → Billing → Budgets & alerts | No spend; alert only |

## How to flip a lever (IaC path)

```bash
# Example: keep one warm instance to eliminate cold starts
pulumi config set khiimori:minInstances "1"
pulumi up

# Example: raise Maps daily cap from 1 000 to 5 000 loads/day
pulumi config set khiimori:mapsDailyQuota "5000"
pulumi up

# Example: raise the budget alert to €25/mo
pulumi config set khiimori:billingBudgetEur "25"
pulumi up
```

> `pulumi up` re-applies only the changed resource; no full redeploy of the
> service unless you also change scaling (which triggers a new Cloud Run revision).

## Lever details

### Cloud Run min-instances (`khiimori:minInstances`)

**Default:** `0` — scale-to-zero. The service shuts down when idle; cold starts add
~200–500 ms on the first request after inactivity.

**When to raise:** sustained user traffic where cold-start latency is noticeable.
Setting `1` keeps one instance warm continuously.

**Cost to raise:** an always-on f1-micro equivalent in Cloud Run is ~€5–15/mo
depending on actual CPU/memory and the europe-west2 pricing. Check the
[Cloud Run pricing calculator](https://cloud.google.com/products/calculator) for
the exact amount.

**IaC definition:** `infra/tunables.ts` → `minInstances`; used in `infra/cloudRun.ts`
`scaling.minInstanceCount`. A drift guard in `tunables.ts` logs a warning when
this is non-zero (`pulumi.log.warn`).

**Dashboard path:** GCP Console → Cloud Run → `khiimori-api` → Edit & deploy new
revision → Autoscaling → Minimum number of instances. Save triggers a new revision.

---

### Cloud Run max-instances (`khiimori:maxInstances`)

**Default:** `2` — caps concurrency fan-out and worst-case compute spend.

**When to raise:** real concurrent user load; `2` is ample for v1's audience.

**Cost to raise:** proportional to traffic (only billed while requests are in flight).
Raising this alone costs nothing unless traffic actually saturates the current max.

**IaC definition:** `infra/tunables.ts` → `maxInstances`.

**Dashboard path:** same as min-instances above.

---

### Neon DB tier (`khiimori:neonTier`)

**Default:** `"free"` — Neon free tier with autosuspend (≈€0).

**Important:** this is a **reference value only** — it documents the intended tier
but does not provision the Neon project (which is managed via the Neon console, not
IaC; see `backend/docs/database.md`). The actual tier change happens in the Neon
console.

**When to raise:** always-on DB availability required (production traffic, response-
time SLAs). Free tier wakes in ~500 ms; the Cloud Run startup probe covers this.

**Cost to raise:** Neon Launch plan ~€10–18/mo (as of 2026-06). Check
[neon.tech/pricing](https://neon.tech/pricing) for the current amount.

**Dashboard path:** [console.neon.tech](https://console.neon.tech) → Project →
Settings → Upgrade plan.

---

### Maps daily quota — hard cap (`khiimori:mapsDailyQuota`)

**Default:** `1000` req/day — enforced as a project-level hard cap via
`gcp.serviceusage.ConsumerQuotaOverride` (`infra/mapsKey.ts`). Requests above the
cap receive HTTP 429 RESOURCE_EXHAUSTED — not billed.

**When to raise:** Maps usage legitimately exceeds the cap (visible in Cloud Monitoring
or by 429 errors from the Maps proxy in Cloud Logging).

**Cost to raise:** Maps JavaScript API bills $7 per 1 000 map loads above the free
28 000 loads/mo threshold. At 5 000 loads/day (~150 000/mo) above the free tier:
150 000 – 28 000 = 122 000 billable loads → ~$854/mo. Stay well inside the free tier
in v1 (PRD §8.4 #2).

**IaC definition:** `infra/tunables.ts` → `mapsDailyQuota`; enforced in
`infra/mapsKey.ts` → `mapsQuotaOverride`.

**Dashboard path:** GCP Console → APIs & Services → Maps JavaScript API → Quotas →
"Map loads per day" → Edit quota (sets the same override manually).

---

### Monthly budget alert (`khiimori:billingBudgetEur`)

**Default:** `10` — alerts at 50%/90%/100% of €10/mo to the configured email.

**Note:** raising this only raises the alert threshold; it does **not** auto-cap
spend. The spend cap comes from the Maps quota override (above) and scale-to-zero
defaults. Raise the budget alert when intentional spend increases (e.g. Neon paid
tier, always-on instance) so the alert doesn't fire falsely.

**IaC definition:** `infra/billing.ts` → `billingBudget`.

**Dashboard path:** GCP Console → Billing → Budgets & alerts → `Khiimori — monthly
budget` → Edit.

---

## Relationship to budget alert

Raising any lever that increases spend → also raise `billingBudgetEur` to avoid a
false alert. The runbook (`cost-guardrails-runbook.md`) has a checklist for this.

## No-code-change guarantee

All levers listed here require only a config value change + `pulumi up` (or the
equivalent console toggle). No code changes, no Dockerfile rebuilds, no manual
`gcloud run deploy`. This is the "single-setting scale-up" of PRD §8.6.
