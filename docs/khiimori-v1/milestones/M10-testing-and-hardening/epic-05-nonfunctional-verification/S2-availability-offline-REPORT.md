# S2 — Availability & offline behaviour verification — REPORT

> Deliverable for [S2](S2-availability-offline.md). Verification date: 2026-07-05.
> Confirms Milestone 09's PWA offline behaviour and Milestone 01's availability
> monitoring against the live `dev` stack. No app/infra code changed.

## Targets (PRD §6)

1. **Graceful read-only/offline behaviour** under poor network — verified end-to-end.
2. **~99.5% API availability** target understood, with **availability monitoring** in place.
3. Failure modes (API down, flaky network) **degrade without data loss**.

## Offline / degraded-network behaviour (Milestones 04/06/09)

The PWA is a hand-rolled service worker + IndexedDB mutation queue (no Workbox — project
no-deps rule). Behaviour under degraded conditions, confirmed against the shipped code and
the offline integration suite:

| Layer | Strategy | Behaviour offline / flaky |
|-------|----------|---------------------------|
| App shell (navigations) | Network-first → cached `index.html` (`web/public/sw.js`) | App still boots; React Router takes over from the cached SPA shell |
| Hashed build assets (`/assets/*`) | Cache-first (immutable, fingerprinted) | Served instantly from cache offline |
| Icons / manifest / favicon | Cache-first | Installed shell renders offline |
| **Current-trip API reads** | Network-first, scoped to the active trip | Online → fresh + cached; offline → last-cached current trip is **viewable read-only** |
| **Writes while offline** | Queued in IndexedDB (`mutationQueue.ts`), replayed in order on reconnect (M04.6 S2) | **No data loss** — writes persist across reloads and apply when connectivity returns |

**Verified live evidence (2026-07-05):**
- `web/src/test/offlineIntegration.test.ts` → **15 tests pass** (offline shell boot,
  current-trip read from cache, queued-write persist + ordered replay).
- Service worker served from production: `https://intricate-reef-424222-d6-web.web.app/sw.js`
  → `200`.
- Web shell reachable: `https://intricate-reef-424222-d6-web.web.app/` → `200`.

This satisfies the "read-only/offline shell + current-trip viewing, queued writes" bar:
offline users can boot the app, view the active trip they last loaded, and keep editing —
those edits queue and replay without loss.

## Availability target & monitoring (Milestone 01 observability)

**~99.5% API availability** — understood as the v1 target (PRD §6): a scale-to-zero Cloud
Run service whose only planned unavailability is cold-start latency (one-off per idle
period, not an error) and the Neon free-tier autosuspend resume. 99.5% ≈ ~3.6 h/month of
allowable downtime — comfortable headroom for a single-author hobby-scale service with no
scheduled maintenance windows.

**Monitoring confirmed live (2026-07-05):**

| Signal | Live evidence | Verdict |
|--------|---------------|---------|
| Availability / error rate | Dashboard **"Khiimori API — Request Metrics"** present (`monitoringDashboardUrl` Pulumi output); 5xx-rate + request-rate (2xx/5xx split) panels (`infra/monitoring.ts`) | ✅ Monitored |
| Latency (cold-start vs regression) | Same dashboard — p50 / p95 `request_latencies` panel | ✅ Monitored |
| Availability-loss alerting | Alert policy **"Khiimori API — 5xx error rate elevated"** = `enabled: True`; the S3 drill exercises it end-to-end | ✅ Live |
| Service reachable now | `GET /readyz` → `200` (first hit paid a cold-start; a one-off, then warm) | ✅ Up |

The 5xx panel and the alert fire on the **same** metric (`request_count`,
`response_code_class="5xx"`), so what the dashboard shows is what pages the author — an
availability drop that manifests as server errors is both visible and alerted.

## Failure modes → graceful degradation (no data loss)

| Failure | Behaviour | Data loss? |
|---------|-----------|------------|
| Network offline | Shell boots from cache; current trip viewable read-only; writes queue | ❌ None — queue replays on reconnect |
| Flaky network (drops mid-write) | Write stays queued until an ack; ordered replay | ❌ None |
| API down / cold-start delay | Reads fall back to cache; writes queue; `/readyz` gates readiness | ❌ None |
| New deploy mid-session | New SW installs silently, takes over on next full load (M09.4 S5) | ❌ None |

## Verdict

✅ **Graceful availability/offline behaviour verified and availability monitoring
confirmed live.** Offline shell + current-trip read + queued-write replay proven by the
15-test offline suite and the prod-served SW; the ~99.5% target is understood and backed by
a live metrics dashboard (request/latency/5xx) plus an enabled 5xx alert. No data-loss path
found; results recorded as a release-gate artifact.
