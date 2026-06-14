// Maps API cost guardrails (M01.8 S2): project-level hard daily quota cap.
//
// The Maps API is the project's #1 named overage/abuse risk (PRD §8.4 #2,
// §8.5). When enabled, this module enforces a hard daily quota cap on Maps
// JavaScript API requests via ConsumerQuotaOverride, which turns
// `mapsDailyQuota` from tunables.ts (the documented lever) into a deny-at-limit
// rather than just a reference value. Requests above the cap receive HTTP 429
// RESOURCE_EXHAUSTED — they are not billed.
//
// Opt-in (default OFF): the cap is gated behind `khiimori:enableMapsQuotaCap`.
// It is off by default for two reasons:
//   1. Maps is not used until M07, so there is nothing to cap yet.
//   2. The ConsumerQuotaOverride targets a live quota metric
//      (maps-backend.googleapis.com/map_load_count, /d/project limit). On a
//      project where the Maps Backend API has no such quota provisioned, the
//      create fails with 404 COMMON_QUOTA_LIMIT_NOT_FOUND — which fails the
//      whole `pulumi up` and blocks every deploy. Enabling it blind is worse
//      than not capping an API the app does not call yet.
// Turn it on once Maps is integrated and verified against the live project:
//   pulumi config set khiimori:enableMapsQuotaCap true && pulumi up
//
// API key restrictions (which specific APIs the key may call) are NOT managed
// here: @pulumi/gcp v9.26.0 does not include the apikeys module. Apply them
// once manually:
//   GCP Console → APIs & Services → Credentials → (select key) → Edit
//   Application restrictions: None (Cloud Run uses dynamic IPs)
//   API restrictions: restrict to the APIs listed in S2 doc
//     - Maps JavaScript API
//     - Geocoding API
//     - Places API
// This is a one-time console step.
//
// Quota cap lever: mapsDailyQuota from tunables.ts (default 1 000 req/day).
// Raise with: pulumi config set khiimori:mapsDailyQuota "2000" && pulumi up
// See cost-guardrails-runbook.md for cost-delta guidance.
//
// Metric path for Maps JavaScript API map loads:
//   service : maps-backend.googleapis.com
//   metric  : maps-backend.googleapis.com/map_load_count  (URL-encoded below)
//   limit   : /d/project  — per-day, per-project  (URL-encoded below)
// If `pulumi up` fails with "metric not found", verify the exact metric name:
//   GCP Console → APIs & Services → Maps JavaScript API → Quotas

import * as gcp from '@pulumi/gcp'
import * as pulumi from '@pulumi/pulumi'
import { mapsDailyQuota } from './tunables'

const cfg = new pulumi.Config()

// Opt-in flag for the Maps daily hard cap (default false — see module doc).
const enableMapsQuotaCap = cfg.getBoolean('enableMapsQuotaCap') ?? false

if (!enableMapsQuotaCap) {
  pulumi.log.info(
    'khiimori:enableMapsQuotaCap is false — Maps daily quota cap NOT provisioned ' +
      '(deferred until Maps is used in M07). Enable with: ' +
      'pulumi config set khiimori:enableMapsQuotaCap true',
  )
}

// Maps Backend API — enabled only when the cap is on (Maps is otherwise unused,
// so we do not enable the API on the project until it is needed). The quota
// override depends on it so the metric exists before the override is set.
const mapsBackendApi = enableMapsQuotaCap
  ? new gcp.projects.Service('maps-backend', {
      service: 'maps-backend.googleapis.com',
      disableOnDestroy: false,
    })
  : undefined

/**
 * Project-level hard daily quota cap on Maps JavaScript API map loads.
 * ConsumerQuotaOverride requires URL-encoded metric and limit values (the GCP
 * Service Usage API encodes "/" as "%2F" in these path segments). `force: true`
 * allows setting the cap below current usage — over-limit requests are denied
 * with 429, not billed (PRD §8.4 #2).
 *
 * Undefined unless `khiimori:enableMapsQuotaCap` is true.
 */
export const mapsQuotaOverride =
  enableMapsQuotaCap && mapsBackendApi
    ? new gcp.serviceusage.ConsumerQuotaOverride(
        'maps-daily-cap',
        {
          service: 'maps-backend.googleapis.com',
          metric: 'maps-backend.googleapis.com%2Fmap_load_count',
          limit: '%2Fd%2Fproject',
          overrideValue: String(mapsDailyQuota),
          force: true,
        },
        { dependsOn: [mapsBackendApi] },
      )
    : undefined
