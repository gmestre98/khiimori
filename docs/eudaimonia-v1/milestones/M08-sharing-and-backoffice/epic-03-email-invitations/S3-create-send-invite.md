# S3 — Create & send invitation

## Context
An Owner can **invite a companion by email + role**; the invite is **sent via transactional email** with a
token and has a lifecycle (`status`: sent → accepted) (PRD §5.9, §8.1).

## Task
Implement creating an invitation and sending the invite email.

## Acceptance criteria
- [ ] An endpoint lets an **Owner** create an invitation for an email + role (Editor/Viewer), generating a
  unique token and `status = sent`.
- [ ] The invite email is sent via the `EmailSender` (S2) with an accept link carrying the token.
- [ ] Creating an invite is **authorized** (only an Owner of the trip, via the `Authorizer`).
- [ ] A unit test covers create + send (faked sender) and that a non-owner cannot invite.

## Constraints
- Only Owners may invite (PRD §3); enforce via the `Authorizer` (Epic 02).
- Do not leak the token except in the email/accept link.

## Definition of done
An Owner can create and send an Editor/Viewer invitation with a tokened accept link; tests green.

## Dependencies
S1 (Invitation), S2 (EmailSender), Epic 02 (Authorizer). Accept in S4.
