# S4 — Session secret from Secret Manager & expiry/refresh tuning

## Context
Session signing/validation material must come from **Secret Manager** and never be logged (PRD §6, §8.5).
Expiry/refresh should be tuned for **mobile-while-abroad** use — re-auth must be smooth, not a hard logout
mid-trip. Builds on S1.

## Task
Wire the session signing key from Secret Manager and set sensible expiry/refresh behaviour.

## Acceptance criteria
- [ ] The session signing/validation key is read from config sourced from **Secret Manager** (M01.4),
  never hardcoded or logged.
- [ ] Session **expiry** is set with a documented value; if using refresh, the refresh path extends a
  session without forcing a full re-login on every expiry.
- [ ] Rotating/replacing the key invalidates old sessions predictably (documented behaviour).
- [ ] The key and session contents never appear in logs (reuse M01.7 redaction).

## Constraints
- Reuse the existing Secret Manager injection (M01.4) and redaction (M01.7); no parallel mechanism
  (PRD §7.0).
- Choose expiry/refresh values that favour an uninterrupted trip experience while remaining secure
  (PRD §6) — document the trade-off.

## Definition of done
Session signing uses a Secret Manager key, expiry/refresh is tuned and documented, and no secret is
logged.

## Dependencies
S1, M01.4 (Secret Manager), M01.7 (redaction).
