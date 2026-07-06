# Story M11.1-S3 — Verify offline / weak-connection & deploy

> **Status:** ✅ Done — this docs PR. Verified live in a browser: cached first paint ("Day 4" itinerary painted while the network hung), the "Updating…" hint online, and full offline render of both the trips dashboard and a trip's day with `fetch` forced to fail. Shipped via the main deploy pipeline (Firebase + Cloud Run + pulumi all green); the deployed E2E suite incl. offline stayed green.

**Epic:** [M11.1 Instant-render caching](README.md) · **Est.** ~2h · **Epic AC:** AC4, AC5 · **Depends on:** S2

## Goal

Prove the instant-render + offline behaviour in a real browser against the deployed app, then mark
the epic done.

## Verification checklist (browser)

1. **Cold start hidden:** with the backend idle (scaled to zero), open a previously-viewed trip →
   itinerary/day renders immediately from cache; a background refresh lands a moment later. No
   full-screen spinner during the cold start.
2. **Weak connection:** throttle to Slow 3G in devtools → screens still render cached data instantly;
   "Updating…" hint shows; fresh data arrives when the request completes.
3. **Offline across trips:** go offline → reload → app boots (SW shell) and **multiple** previously
   opened trips/days still render from IndexedDB (not just the last active trip). Writes queue as
   before and replay on reconnect (existing behaviour, unchanged).
4. **Fresh device / no cache:** first load shows the normal loading state, then populates and caches.

## Docs

- Flip the epic README **Status** callout to ✅ Done with PR links and AC count.
- Tick the epic ACs and the story files.
- Update the M11 milestone README epic table + the top-level milestones README.

## Definition of done

All checks pass in a browser against the deployed app; docs updated; changes deployed and confirmed
live.
