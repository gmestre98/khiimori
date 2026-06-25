# Epic M08.3 — Email invitations (lifecycle, accept, revoke)

> **Status:** ✅ Done — all 5 ACs complete across 5 stories ([#346](https://github.com/gmestre98/khiimori/pull/346), [#347](https://github.com/gmestre98/khiimori/pull/347), [#348](https://github.com/gmestre98/khiimori/pull/348), [#349](https://github.com/gmestre98/khiimori/pull/349), [#350](https://github.com/gmestre98/khiimori/pull/350)). Schema + migration, Resend email sender, create-and-send endpoint, atomic accept flow, change-role/revoke endpoints, and full invitation lifecycle integration tests.

> Milestone: [08 — Sharing & Backoffice](../README.md) · PRD refs: §5.9, §8.1, §9, §11.1.

## Description

Let an Owner **invite a companion by email** with a role (**Editor** or **Viewer**). An invitation
has a lifecycle (`status`, `token`): sent → accepted. The invite is delivered by **transactional
email** (free tier). On the invitee's Google sign-in, a **matching email claims the invitation** and
creates a `TripMembership`. Owners can **change a member's role or revoke** access, with revocation
taking effect immediately (via Epic 02).

**Estimated effort:** ~2–3 developer-days (one developer).

## Acceptance Criteria

- [x] A migration adds `Invitation(id, trip_id, email, role, status, token)` to `sharing.*` per
      PRD §9; role ∈ `Editor | Viewer` (no per-section permissions in v1) (PRD §7.7, §11.1).
- [x] An Owner can **invite by email + role**; an invite is **sent via transactional email** with a
      token and has a lifecycle (`status`: sent → accepted) (PRD §5.9, §8.1).
- [x] On the invitee's **Google sign-in (Milestone 02)**, a **matching email claims the invitation**
      and **creates a `TripMembership`** (Epic 01) transactionally (PRD §5.9, §9).
- [x] An Owner can **change a member's role** or **revoke** an invitation/membership; revocation
      removes visibility/edit ability immediately (via Epic 02) (PRD §5.9).
- [x] Unit + integration tests cover invite → accept → membership, role change, and revoke (PRD §7.6).

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

## User stories

The epic is split into **5 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-invitation-schema.md) | `Invitation` schema & migration | ~2.5h | AC1 | M03, Epic 01 |
| [S2](S2-email-sender.md) | Transactional email sender | ~3h | AC2 | M01.4 |
| [S3](S3-create-send-invite.md) | Create & send invitation | ~3h | AC2 | S1, S2, Epic 02 |
| [S4](S4-accept-invite.md) | Accept invitation on sign-in (claim → membership) | ~3.5h | AC3 | S1, S3, M02, Epic 01 |
| [S5](S5-change-role-revoke-tests.md) | Change role / revoke & invitation tests | ~3h | AC4, AC5 | S1–S4, Epic 02 |

**Total:** ~15h (≈ 2–3 dev-days), consistent with the epic's ~2–3 dev-day estimate.

### Sequencing

```
S1 Invitation schema ──┐
S2 Email sender ───────┴─ S3 Create & send ── S4 Accept (claim → membership) ── S5 Change role/revoke & tests
```

> S2 flags confirming the transactional-email provider/library with the author. The one new billable
> touchpoint is invite email — free tier (~3k/mo), €0 at expected volume.
