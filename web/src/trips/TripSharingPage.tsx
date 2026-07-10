import { useEffect, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import {
  UnauthorizedError,
  fetchSharingData,
  sendInvitation,
  revokeInvitation,
  changeMemberRole,
  revokeMember,
  type SharingData,
  type TripMember,
  type TripInvitation,
  type Trip,
} from '../lib/api'
import { useAuth } from '../auth/AuthContext'
import { ConfirmModal } from '../components/ConfirmModal'

type OutletCtx = { trip: Trip }

// initialOf returns an uppercase initial for an avatar from an id or email.
function initialOf(idOrEmail: string): string {
  const cleaned = idOrEmail.replace(/^user-/, '')
  return (cleaned[0] ?? '?').toUpperCase()
}

// avatarColor maps a role to its avatar fill (owner = ink, others accent/amber).
function avatarColor(role: string): string {
  if (role === 'owner') return 'var(--ink)'
  if (role === 'editor') return 'var(--accent)'
  return 'var(--amber)'
}

// isValidEmail does a light structural check so we don't send an invite to an
// address the recipient could never sign in with — a typo would otherwise create
// a pending invite that can never be accepted. The server re-validates; this is
// only fast, in-form feedback.
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function TripSharingPage() {
  const { trip } = useOutletContext<OutletCtx>()
  const { tripId } = useParams<{ tripId: string }>()
  const { user } = useAuth()

  const id = tripId ?? trip.id

  const [data, setData] = useState<SharingData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refetch, setRefetch] = useState(0)

  // loading is true only on the initial fetch (data not yet arrived and no error)
  const loading = data === null && error === null && refetch === 0

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('viewer')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  // Confirm revoke state
  const [revokeTarget, setRevokeTarget] = useState<
    { kind: 'member'; member: TripMember } | { kind: 'invitation'; inv: TripInvitation } | null
  >(null)
  const [revoking, setRevoking] = useState(false)

  const myRole = data?.members.find((m) => m.user_id === user?.id)?.role
  const isOwner = myRole === 'owner'

  useEffect(() => {
    const controller = new AbortController()
    fetchSharingData(id, controller.signal)
      .then((d) => setData(d))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (err instanceof UnauthorizedError) return
        setError('Could not load sharing info.')
      })
    return () => controller.abort()
  }, [id, refetch])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    const email = inviteEmail.trim().toLowerCase()
    if (!email) return
    if (!isValidEmail(email)) {
      setInviteError('Enter a valid email address, e.g. name@example.com.')
      return
    }
    // Warn before re-inviting an email that already has a pending invite —
    // otherwise it silently stacks a second invitation for the same person.
    const alreadyInvited = data?.invitations.some(
      (inv) => inv.status === 'sent' && inv.email.toLowerCase() === email,
    )
    if (alreadyInvited) {
      setInviteError('That email already has a pending invite for this trip.')
      return
    }
    setInviting(true)
    setInviteError(null)
    try {
      await sendInvitation(id, email, inviteRole)
      setInviteEmail('')
      setRefetch((n) => n + 1)
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : 'Could not send invitation.')
    } finally {
      setInviting(false)
    }
  }

  async function handleConfirmRevoke() {
    if (!revokeTarget) return
    setRevoking(true)
    try {
      if (revokeTarget.kind === 'member') {
        await revokeMember(id, revokeTarget.member.user_id)
      } else {
        await revokeInvitation(id, revokeTarget.inv.id)
      }
      setRevokeTarget(null)
      setRefetch((n) => n + 1)
    } catch {
      // leave modal open on error so user can retry
    } finally {
      setRevoking(false)
    }
  }

  async function handleChangeRole(userId: string, role: 'editor' | 'viewer') {
    try {
      await changeMemberRole(id, userId, role)
      setRefetch((n) => n + 1)
    } catch {
      // server is the authority; reload will reconcile
      setRefetch((n) => n + 1)
    }
  }

  if (loading) {
    return (
      <p className="sharing-loading" aria-busy="true">
        Loading sharing…
      </p>
    )
  }
  if (error) {
    return (
      <p role="alert" className="sharing-error">
        {error}
      </p>
    )
  }
  if (!data) return null

  const pendingInvitations = data.invitations.filter((inv) => inv.status === 'sent')

  return (
    <div className="sharing-page">
      <div className="screen-content sharing-body">
        <h2 className="h1 sharing-title">Sharing</h2>
        <p className="meta sharing-subtitle">
          People you invite see only this trip. Roles take effect immediately.
        </p>

        {/* Invite form — owners only */}
        {isOwner && (
          <section className="card pad sharing-invite-card" aria-label="Invite someone">
            <form className="sharing-invite-form" onSubmit={handleInvite} noValidate>
              <div className="field grow">
                <label htmlFor="invite-email">Email address</label>
                <input
                  id="invite-email"
                  className="input"
                  type="email"
                  placeholder="companion@example.com"
                  value={inviteEmail}
                  onChange={(e) => {
                    setInviteEmail(e.target.value)
                    if (inviteError) setInviteError(null)
                  }}
                  required
                  disabled={inviting}
                  autoComplete="off"
                />
              </div>
              <div className="field sharing-invite-role-field">
                <label htmlFor="invite-role">Role</label>
                <select
                  id="invite-role"
                  className="input"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'editor' | 'viewer')}
                  disabled={inviting}
                >
                  <option value="viewer">Viewer — read only</option>
                  <option value="editor">Editor — can edit</option>
                </select>
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={inviting || !inviteEmail.trim()}
              >
                {inviting ? 'Sending…' : 'Send Invite'}
              </button>
            </form>
            {inviteError && (
              <p role="alert" className="sharing-invite-error mt3">
                {inviteError}
              </p>
            )}
          </section>
        )}

        {/* Members list */}
        <section aria-label="Members">
          <div className="eyebrow mb3">Members · {data.members.length}</div>
          {data.members.length === 0 ? (
            <p className="sharing-empty">No members yet.</p>
          ) : (
            <ul className="card sharing-members-list">
              {data.members.map((member) => (
                <li key={member.id} className="sharing-member-item">
                  <div className="avatar" style={{ background: avatarColor(member.role) }}>
                    {initialOf(member.user_id)}
                  </div>
                  <span className="sharing-member-id grow">{member.user_id}</span>
                  {member.role === 'owner' ? (
                    <span className="chip solid">Owner</span>
                  ) : isOwner ? (
                    <span className="sharing-member-actions row gap2">
                      <select
                        className="sharing-role-select"
                        value={member.role}
                        aria-label={`Change role for ${member.user_id}`}
                        onChange={(e) =>
                          handleChangeRole(member.user_id, e.target.value as 'editor' | 'viewer')
                        }
                      >
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button
                        className="sharing-revoke-btn"
                        onClick={() => setRevokeTarget({ kind: 'member', member })}
                        aria-label={`Revoke access for ${member.user_id}`}
                      >
                        Revoke
                      </button>
                    </span>
                  ) : (
                    <span className="chip outline" style={{ textTransform: 'capitalize' }}>
                      {member.role}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Pending invitations — owners only */}
        {isOwner && (
          <section aria-label="Pending invitations">
            <div className="eyebrow mb3">Pending invites · {pendingInvitations.length}</div>
            {pendingInvitations.length === 0 ? (
              <p className="sharing-empty">No pending invitations.</p>
            ) : (
              <ul className="card sharing-invitations-list">
                {pendingInvitations.map((inv) => (
                  <li key={inv.id} className="sharing-invitation-item">
                    <div className="avatar sharing-invitation-avatar">?</div>
                    <div className="grow">
                      <div className="sharing-invitation-email">{inv.email}</div>
                      <div className="meta" style={{ textTransform: 'capitalize' }}>
                        Invited as {inv.role} · {inv.status}
                      </div>
                    </div>
                    <button
                      className="sharing-revoke-btn"
                      onClick={() => setRevokeTarget({ kind: 'invitation', inv })}
                      aria-label={`Revoke invitation for ${inv.email}`}
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Roles legend */}
        <section className="card pad sharing-roles" aria-label="Roles">
          <div className="eyebrow mb3">Roles</div>
          <div className="row between sharing-roles-row">
            <b>Owner</b>
            <span className="meta">Full control + sharing</span>
          </div>
          <div className="row between sharing-roles-row">
            <b>Editor</b>
            <span className="meta">Edit plan, budget, journal</span>
          </div>
          <div className="row between">
            <b>Viewer</b>
            <span className="meta">Read-only access</span>
          </div>
        </section>
      </div>

      {/* Confirm revoke modal */}
      {revokeTarget && (
        <ConfirmModal
          title="Confirm Revoke"
          message={
            revokeTarget.kind === 'member'
              ? `Revoke access for this member? They will lose access to the trip immediately.`
              : `Revoke the invitation for ${revokeTarget.inv.email}?`
          }
          confirmLabel={revoking ? 'Revoking…' : 'Revoke'}
          onConfirm={handleConfirmRevoke}
          onCancel={() => setRevokeTarget(null)}
          danger
        />
      )}
    </div>
  )
}
