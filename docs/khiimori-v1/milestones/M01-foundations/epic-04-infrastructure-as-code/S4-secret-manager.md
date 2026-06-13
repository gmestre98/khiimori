# S4 — Secret Manager secrets

> **Status:** ✅ Done — Secret Manager secret containers (#111). Deployed live to the dev stack.

## Context
Runtime secrets — the **DB URL** (Neon, M01.3), the **Google OAuth client**, and the **Google Maps key** —
must live in **Secret Manager** and never be committed or shipped to the client (PRD §6, §8.5). This story
provisions the secret containers via Pulumi so S7 can mount them into Cloud Run at runtime.

Assumes the Pulumi scaffold (**S1**) exists; the DB URL value comes from M01.3.

> **Carried over from M01.3:** the DB connection URL stored here should use a **dedicated
> least-privilege Neon role** (`app_rw`), not the `neondb_owner` role v1 currently connects as. The
> role-creation SQL is documented in [`backend/docs/database.md`](../../../../../backend/docs/database.md);
> create the role, then use *its* credential as the secret value below.

## Task
Provision Secret Manager secrets for the DB URL, OAuth client, and Maps key via Pulumi.

## Acceptance criteria
- [x] Secret Manager secrets are created for: **DB connection URL**, **OAuth client id/secret**, **Maps API key**.
- [x] `secretmanager.googleapis.com` is enabled via IaC.
- [x] The Pulumi program provisions the **secret containers**; **secret values are NOT committed** — they're
  added out-of-band (CLI/console) or sourced from Pulumi secret config (encrypted), documented either way (PRD §8.5).
- [x] Secret resource ids/names are stack outputs for S7 (Cloud Run) to reference.
- [x] Access is least-privilege: only the Cloud Run service account (S5) can access them.
- [x] The **DB connection URL** secret value uses a dedicated least-privilege Neon role (`app_rw`),
  **not** `neondb_owner` — closing the M01.3 S1 follow-up (role SQL in `backend/docs/database.md`).

## Constraints
- No plaintext secret values in git, Pulumi state diffs, or CI logs (PRD §6, §8.5).
- Keep the secret set minimal — only what runtime needs now (PRD §7.0).

## Definition of done
`pulumi up` creates the three secret containers; values are supplied securely out-of-band; ids are exported.

## Dependencies
S1 (scaffold). DB URL from M01.3. Consumed by S5 (access grant) and S7 (runtime injection).
