// Maps API cost guardrails (M01.8 S2): project-level hard daily quota cap.
//
// The Maps API is the project's #1 named overage/abuse risk (PRD §8.4 #2,
// §8.5). This module enforces a hard daily quota cap on Maps JavaScript API
// requests via ConsumerQuotaOverride, which turns `mapsDailyQuota` from
// tunables.ts (the documented lever) into a deny-at-limit rather than just
// a reference value. Requests above the cap receive HTTP 429
// RESOURCE_EXHAUSTED — they are not billed.
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
// This is a one-time console step; the quota cap (below) is IaC-managed and
// re-enforced on every `pulumi up`.
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
import { mapsDailyQuota } from './tunables'

// Project-level hard daily quota cap on Maps JavaScript API map loads.
// ConsumerQuotaOverride requires URL-encoded metric and limit values
// (the GCP Service Usage API encodes "/" as "%2F" in these path segments).
// `force: true` allows setting the cap below current usage — over-limit
// requests are denied with 429, not billed (PRD §8.4 #2).
export const mapsQuotaOverride = new gcp.serviceusage.ConsumerQuotaOverride('maps-daily-cap', {
  service: 'maps-backend.googleapis.com',
  metric: 'maps-backend.googleapis.com%2Fmap_load_count',
  limit: '%2Fd%2Fproject',
  overrideValue: String(mapsDailyQuota),
  force: true,
})
