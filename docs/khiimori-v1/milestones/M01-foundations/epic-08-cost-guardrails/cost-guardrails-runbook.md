# Cost Guardrails Runbook (M01.8)

> **Who this is for:** the author, mid-trip on a phone. All links open in a
> mobile browser; no laptop needed for the response steps.

## Alert channels you'll receive

| Alert | Channel | Trigger |
|-------|---------|---------|
| Billing budget 50% | Gmail (push notification) | ≥€5 spent in the month |
| Billing budget 90% | Gmail (push notification) | ≥€9 spent in the month |
| Billing budget 100% | Gmail (push notification) | ≥€10 spent in the month |
| API 5xx error rate | Gmail (push notification) | Sustained 5xx for > 3 min (M01.7 S4) |

All notifications land in **goncalo.mestre1998@gmail.com**. Gmail push
notifications work on iOS and Android; no extra app needed.

---

## Mobile-reachable dashboards

These URLs open the relevant dashboards on a phone browser:

| Dashboard | URL | What to check |
|-----------|-----|---------------|
| GCP Billing | https://console.cloud.google.com/billing | Current month spend, per-service breakdown |
| Cloud Run metrics | https://console.cloud.google.com/run | Requests, latency, instance count |
| Cloud Monitoring | https://console.cloud.google.com/monitoring | Error rate panel (M01.7 S3 dashboard) |
| GCP Quotas (Maps) | https://console.cloud.google.com/apis/api/maps-backend.googleapis.com/quotas | Maps JS API daily usage vs. cap |
| Neon console | https://console.neon.tech | DB connection count, compute status |

Tip: add these to your phone's browser bookmarks before travelling.

---

## Scenario 1 — "I got a budget alert"

### 50% alert (≥€5 this month)

Normal if you've been actively developing or have done a test deploy. No action
required unless spend is tracking significantly above €5 at the start of the month.

**Check:** open Billing → click current month → look for unexpected services.
Expected charges: Cloud Run requests (tiny), Secret Manager reads (tiny), Cloud
Storage (tiny), Artifact Registry (tiny). If Maps or Firebase Hosting dominates,
see the Maps scenario below.

### 90% or 100% alert (≥€9 / ≥€10)

Act within 24 hours to avoid further spend this month.

**Steps (phone-only):**

1. **Identify the spending service:** Billing → current month → "Cost breakdown
   by service". Note which service is highest.

2. **If Maps API:** check https://console.cloud.google.com/apis/api/maps-backend.googleapis.com/quotas.
   If daily usage is near the cap (1 000 req/day default), the cap is working.
   If the quota override failed to apply (e.g. wrong metric — see S2 note), usage
   may be uncapped. In that case: disable the Maps API key temporarily in
   GCP Console → APIs & Services → Credentials → Disable key, then re-run
   `pulumi up` from a laptop when available.

3. **If Cloud Run:** check that `minInstances` is still `0` (scale-to-zero).
   `pulumi stack output scaleToZeroActive` should return `true`. If it shows
   `false`, someone raised `minInstances` — restore it:
   ```
   pulumi config set khiimori:minInstances "0"
   pulumi up
   ```

4. **Raise the budget alert** once you understand the spend, so you're not paged
   again this month for expected costs:
   ```
   pulumi config set khiimori:billingBudgetEur "20"
   pulumi up
   ```
   Or: GCP Console → Billing → Budgets & alerts → `Khiimori — monthly budget`
   → Edit → Budget amount → raise.

---

## Scenario 2 — "The app is slow / I need more capacity now"

> First verify it's a capacity issue, not a bug. Check Cloud Monitoring for
> elevated 5xx (if yes, it's a bug — see the observability runbook). If 2xx
> but slow, it's likely cold-start latency or DB wake-up.

### Eliminate cold starts (Cloud Run warm instance)

**IaC path (requires laptop):**
```bash
pulumi config set khiimori:minInstances "1"
pulumi up   # takes ~1 min; no downtime
```

**Phone-only path:**
GCP Console → Cloud Run → `khiimori-api` → Edit & deploy new revision →
Autoscaling → Minimum number of instances → set to `1` → Deploy.

**Cost delta:** ~€5–15/mo (see `scale-up-levers.md` for current estimate).
Raise `billingBudgetEur` to avoid a false alert.

### Wake Neon faster / eliminate DB cold starts

The Cloud Run startup probe (5 s period, 12 retries = ~60 s window) gives Neon
time to wake from autosuspend. If DB wakes are consistently slow:

**Phone-only path:** [console.neon.tech](https://console.neon.tech) → Project →
Settings → Upgrade to Launch plan (~€10–18/mo). This disables autosuspend.

Alternatively, set `min_cu` in Neon console to keep the compute scaled up —
available on the free tier as a temporary measure.

### Raise Maps daily cap

If users report Maps features not loading and Cloud Logging shows 429 from Maps:

**IaC path (requires laptop):**
```bash
pulumi config set khiimori:mapsDailyQuota "5000"
pulumi up
```

**Phone-only path:** GCP Console → APIs & Services → Maps JavaScript API →
Quotas → "Map loads per day" → Edit Quota → set the new value.

**Cost delta:** Maps JS API bills $7/1 000 loads above 28 000/mo free tier.
At 5 000 loads/day (150 000/mo), charges could reach ~$854/mo — stay well inside
the free tier in v1 and raise the cap cautiously.

---

## Scenario 3 — "I want to scale everything back to ≈€0"

If you provisioned scale-up resources during a trip and want to return to idle:

```bash
pulumi config set khiimori:minInstances "0"
pulumi config set khiimori:mapsDailyQuota "1000"
pulumi config set khiimori:billingBudgetEur "10"
pulumi up
```

Neon: [console.neon.tech](https://console.neon.tech) → Project → downgrade plan
if you upgraded.

---

## One-time console step — Maps API key restrictions

> Do this once after the first `pulumi up` of M01.8 (S2). The quota cap is
> IaC-managed; key restrictions require the console since @pulumi/gcp v9.26.0
> does not include the `apikeys` module.

1. GCP Console → APIs & Services → Credentials
2. Select `khiimori-maps-api-key` → Edit
3. API restrictions → Restrict key → add:
   - Maps JavaScript API
   - Geocoding API
   - Places API
4. Save

This limits the blast radius if the key is ever leaked — it can only call the
three Maps APIs above, not the full GCP surface.

---

## Summary checklist (print before a long trip)

- [ ] Gmail push notifications enabled on your phone
- [ ] Billing, Cloud Run, Cloud Monitoring, GCP Quotas, Neon bookmarked
- [ ] `pulumi stack output scaleToZeroActive` returns `true`
- [ ] `pulumi stack output billingBudgetName` shows the budget name (budget configured)
- [ ] Maps API key restrictions applied in console (one-time, after M01.8 deploy)
- [ ] `observability-runbook.md` bookmarked for error alerts (M01.7)
