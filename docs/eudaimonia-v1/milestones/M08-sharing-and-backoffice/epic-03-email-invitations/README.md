# Epic M08.3 — Email invitations (lifecycle, accept, revoke)

> Milestone: [08 — Sharing & Backoffice](../README.md) · PRD refs: §5.9, §8.1, §9, §11.1.

## Description

Let an Owner **invite a companion by email** with a role (**Editor** or **Viewer**). An invitation
has a lifecycle (`status`, `token`): sent → accepted. The invite is delivered by **transactional
email** (free tier). On the invitee's Google sign-in, a **matching email claims the invitation** and
creates a `TripMembership`. Owners can **change a member's role or revoke** access, with revocation
taking effect immediately (via Epic 02).

**Estimated effort:** ~2–3 developer-days (one developer).

## Acceptance Criteria

- [ ] A migration adds `Invitation(id, trip_id, email, role, status, token)` to `sharing.*` per
      PRD §9; role ∈ `Editor | Viewer` (no per-section permissions in v1) (PRD §7.7, §11.1).
- [ ] An Owner can **invite by email + role**; an invite is **sent via transactional email** with a
      token and has a lifecycle (`status`: sent → accepted) (PRD §5.9, §8.1).
- [ ] On the invitee's **Google sign-in (Milestone 02)**, a **matching email claims the invitation**
      and **creates a `TripMembership`** (Epic 01) transactionally (PRD §5.9, §9).
- [ ] An Owner can **change a member's role** or **revoke** an invitation/membership; revocation
      removes visibility/edit ability immediately (via Epic 02) (PRD §5.9).
- [ ] Unit + integration tests cover invite → accept → membership, role change, and revoke (PRD §7.6).

## Implementation Details / Architecture

- Lives in the **`sharing` module** (PRD §7.1, §7.7). Invitations use foreign keys + transactional
  updates so claiming an invite and creating a membership is atomic (PRD §7.7).
- **Transactional email** (e.g. Resend/Brevo free tier) sends the invite behind a thin interface so
  the provider can be swapped; the secret lives in Secret Manager (PRD §8.1, §6).
- Email-to-account linking happens at sign-in time: the invitee's verified Google email is matched to
  pending invitations (PRD §5.9, Milestone 02).

## Dependencies

- **Upstream:** Epic 01 (membership creation), Milestone 02 (sign-in / verified email), Milestone 01
  (transactional email config / secret).
- **Downstream:** Epic 04 (invite UI), Epic 02 (revocation enforcement), Milestone 10 (shared-trip
  journey).

## Costs Impact

Low — the one new billable touchpoint is **transactional email** for invites, covered by a **free
tier (~3k emails/mo)** at expected volume, **€0** (PRD §8.1). Memberships/invitations are small rows.

## Designs

Invite/share flow:
[assets/03-mobile-and-sharing.svg](../../../assets/03-mobile-and-sharing.svg) (PRD §4.3).
