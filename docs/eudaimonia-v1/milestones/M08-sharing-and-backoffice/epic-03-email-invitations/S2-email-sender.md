# S2 — Transactional email sender

## Context
Invites are delivered by **transactional email** (e.g. Resend/Brevo free tier) behind a thin interface so
the provider can be swapped; the secret lives in Secret Manager (PRD §8.1, §6).

## Task
Define an `EmailSender` interface and a transactional-email implementation.

## Acceptance criteria
- [ ] An `EmailSender` interface exposes sending a templated invite email (recipient, trip, role, accept
  link).
- [ ] A transactional-email implementation backs it, with the API key from **Secret Manager** (M01.4),
  never logged.
- [ ] Callers depend on the interface (provider swappable, PRD §7.0).
- [ ] A unit test exercises the interface with a faked sender (no live email).

## Constraints
- A transactional-email provider/SDK is a likely dependency — **confirm the provider and library with the
  author before adding it** (project rule: stdlib-first, ask before deps).
- Secret in Secret Manager only; reuse M01.7 redaction.

## Definition of done
An `EmailSender` interface with a transactional-email implementation exists behind a swappable seam;
faked-sender test green.

## Dependencies
M01.4 (Secret Manager). Consumed by S3 (send invite).
