// Scale tunables — the cost levers, expressed as typed stack config defaulting
// to scale-to-zero. The PRD's posture is "run at ≈€0, scale up on demand with a
// single setting" (PRD §8.6): scaling up should be changing a value here +
// `pulumi up`, never a rewrite. This module defines the levers; the budget
// alert and Maps *hard cap* enforcement live in M01.8 (cross-link, not here).

import * as pulumi from '@pulumi/pulumi'

const cfg = new pulumi.Config()

// Cloud Run minimum instances. Default 0 = scale-to-zero, so an idle service
// costs ≈€0 (PRD §8.1, §8.6) — you pay only while a request is in flight.
// Cost to raise: 1 keeps an instance warm 24/7 (removes cold starts) and is
// billed continuously (~a few €/mo at the smallest size). Dashboard toggle:
// Cloud Run console → service → "Edit & deploy new revision" → Minimum number
// of instances. Flipping this value + `pulumi up` is the *only* action needed.
export const minInstances = cfg.getNumber('minInstances') ?? 0

// Cloud Run maximum instances. Caps concurrency fan-out and worst-case spend.
// Default 2 is ample for v1's tiny audience; raise for real concurrency.
export const maxInstances = cfg.getNumber('maxInstances') ?? 2

// Neon tier (reference value). The database is the one component that is not
// free-forever scale-to-zero; v1 runs the **free** tier (≈€0). Cost to raise:
// free → paid (~€10–18/mo) for always-on reliability — a toggle in the Neon
// console, not a code change (backend/docs/database.md, PRD §8.6). Recorded
// here as the documented lever; the actual tier is set in the Neon dashboard.
export const neonTier = cfg.get('neonTier') ?? 'free'

// Google Maps daily request quota (reference value). Kept low to stay within
// the free allowance. Cost to raise: more requests bill per the Maps platform;
// the **hard cap enforcement** is M01.8 (cost guardrails) — this is the lever,
// not the enforcement. Dashboard toggle: Google Cloud console → APIs & Services
// → (Maps API) → Quotas.
export const mapsDailyQuota = cfg.getNumber('mapsDailyQuota') ?? 1000
