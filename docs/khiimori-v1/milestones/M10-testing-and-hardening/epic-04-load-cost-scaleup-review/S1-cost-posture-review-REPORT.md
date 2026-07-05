# S1 — Cost posture review (idle ≈€0–3/mo, guardrails live) — REPORT

> Deliverable for [S1](S1-cost-posture-review.md). Review date: 2026-07-05.
> Live verification against project `intricate-reef-424222-d6` (Pulumi `dev`
> stack). This is a checklist against PRD §8.4–8.6 — no infra was changed.

## Idle cost posture — ≈€0–3/mo (PRD §8.1, §8.6)

| Component | Idle cost | Live evidence | Verdict |
|-----------|-----------|---------------|---------|
| Cloud Run (`khiimori-api`) | ≈€0 | `minScale=0` on the live service; `pulumi stack output scaleToZeroActive` = `true` | ✅ Scale-to-zero |
| Neon Postgres | ≈€0 | Free tier, autosuspend after ~5 min (`neonTier` tunable = `free`) | ✅ Free tier |
| Firebase Hosting (web) | ≈€0 | Free Spark tier; static bundle only | ✅ Free tier |
| Google Maps | ≈€0 | Usage inside the free allowance; server key restricted to 3 Maps APIs | ✅ Within free |
| Secret Manager / Artifact Registry / GCS | pennies | Tiny read volume, small bundle/media | ✅ Negligible |

**Idle total: ≈€0/mo**, well inside the ≈€0–3/mo target. The one non-free-at-idle
component is the DB (see below) — but on the free tier it is also ≈€0.

## Scale-to-zero (PRD §8.4 #1)

- Live Cloud Run annotations: `autoscaling.knative.dev/minScale=0`,
  `maxScale=2`. No `min-instances` set by default.
- `pulumi stack output scaleToZeroActive` → `true`.
- `tunables` output: `{minInstances:0, maxInstances:2, neonTier:"free",
  mapsDailyQuota:1000}`.

✅ Confirmed: the stateless service scales to zero when idle.

## Guardrails live (PRD §8.5, from M01.8)

| Guardrail | Live state | Evidence |
|-----------|-----------|----------|
| GCP billing budget + alert | ✅ Active | Budget "Khiimori — monthly budget" = €10/mo, alert thresholds 50% / 90% / 100% (CURRENT_SPEND) |
| Maps key restriction | ✅ Active | `khiimori-maps-server` key restricted to exactly `geocoding-backend`, `places-backend`, `maps-backend` — blast radius limited to the 3 Maps APIs |
| Maps hard quota cap | ⚠️ **Not live** — see F1 | `enableMapsQuotaCap` is default OFF; no `ConsumerQuotaOverride` present; the live per-day `billable_default` limit is unbounded |

## DB scale-up lever (PRD §8.4 #1, §8.6)

The database is the one component that does not scale to zero for free. Confirmed
running on the **Neon free tier** (`neonTier` = `free`), with the documented
paid-tier lever (free → Launch, ~€10–18/mo) being a **Neon-console toggle, not a
code change** (`infra/tunables.ts` comment + `scale-up-levers.md`). ✅

## Findings

| ID | Severity | Description | Release-blocking? | Decision |
|----|----------|-------------|-------------------|----------|
| F1 | Low | Maps **hard daily quota cap is not live**: `enableMapsQuotaCap` defaults OFF (it 404s on projects without the `map_load_count` quota provisioned — see `infra/mapsKey.ts`), so there is no deny-at-limit `ConsumerQuotaOverride`. | No | **Accept for v1.** Overspend is still bounded by three live backstops: (1) the server key is restricted to the 3 Maps APIs, (2) the €10 billing budget alerts at 50/90/100%, and (3) real usage sits inside the free tier. The hard cap remains a one-config-line lever (`khiimori:enableMapsQuotaCap true`) to enable if usage grows. Recorded in S3 sign-off. |

No release-blocking cost findings.

## Verdict

✅ **Idle posture ≈€0/mo and live guardrails confirmed.** Scale-to-zero active,
billing budget + Maps key restriction live, Neon on the free tier with a config-
only paid lever. One low finding (F1 — Maps hard cap not live, mitigated) carried
to the S3 sign-off.
