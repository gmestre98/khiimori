# S4 — Accept invitation on sign-in (claim → membership)

## Context
On the invitee's **Google sign-in (Milestone 02)**, a **matching email claims the invitation** and
**creates a `TripMembership`** transactionally (PRD §5.9, §9). This links the invite to the signed-in
account.

## Task
Implement accepting an invitation: claim by token/email and create the membership.

## Acceptance criteria
- [ ] An accept flow (token-based, completed when the invitee is signed in) verifies the invite and that
  the **signed-in user's verified email matches** the invitation email.
- [ ] On success it creates a `TripMembership` (Epic 01) with the invited role and sets the invitation
  `status = accepted` — in **one transaction**.
- [ ] An already-accepted, revoked, or mismatched invite is rejected clearly.
- [ ] A unit/integration test covers accept → membership and the mismatch/expired cases.

## Constraints
- Match on the **verified Google email** (Milestone 02) — do not trust a client-supplied email.
- Atomic: claiming the invite and creating the membership commit together (PRD §7.7).

## Definition of done
A signed-in invitee with a matching email can accept an invite, gaining membership atomically; tests
green.

## Dependencies
S1, S3, Milestone 02 (sign-in / verified email), Epic 01 (membership create). Revoke/role in S5.
