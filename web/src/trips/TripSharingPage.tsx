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
    if (!inviteEmail.trim()) return
    setInviting(true)
    setInviteError(null)
    try {
      await sendInvitation(id, inviteEmail.trim(), inviteRole)
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
      <h2 className="sharing-title">Sharing</h2>

      {/* Members list */}
      <section className="sharing-section" aria-label="Members">
        <h3 className="sharing-section-title">Members</h3>
        {data.members.length === 0 ? (
          <p className="sharing-empty">No members yet.</p>
        ) : (
          <ul className="sharing-members-list">
            {data.members.map((member) => (
              <li key={member.id} className="sharing-member-item">
                <span className="sharing-member-id">{member.user_id}</span>
                <span className="sharing-role-badge" data-role={member.role}>
                  {member.role}
                </span>
                {isOwner && member.role !== 'owner' && (
                  <span className="sharing-member-actions">
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
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Pending invitations — owners only */}
      {isOwner && (
        <section className="sharing-section" aria-label="Pending invitations">
          <h3 className="sharing-section-title">Pending Invitations</h3>
          {pendingInvitations.length === 0 ? (
            <p className="sharing-empty">No pending invitations.</p>
          ) : (
            <ul className="sharing-invitations-list">
              {pendingInvitations.map((inv) => (
                <li key={inv.id} className="sharing-invitation-item">
                  <span className="sharing-invitation-email">{inv.email}</span>
                  <span className="sharing-role-badge" data-role={inv.role}>
                    {inv.role}
                  </span>
                  <span className="sharing-invitation-status">{inv.status}</span>
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

      {/* Invite form — owners only */}
      {isOwner && (
        <section className="sharing-section sharing-invite-section" aria-label="Invite someone">
          <h3 className="sharing-section-title">Invite Someone</h3>
          <form className="sharing-invite-form" onSubmit={handleInvite} noValidate>
            <label className="sharing-invite-label" htmlFor="invite-email">
              Email address
            </label>
            <input
              id="invite-email"
              className="sharing-invite-input"
              type="email"
              placeholder="companion@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              disabled={inviting}
              autoComplete="off"
            />
            <label className="sharing-invite-label" htmlFor="invite-role">
              Role
            </label>
            <select
              id="invite-role"
              className="sharing-invite-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'editor' | 'viewer')}
              disabled={inviting}
            >
              <option value="viewer">Viewer — read only</option>
              <option value="editor">Editor — can edit</option>
            </select>
            {inviteError && (
              <p role="alert" className="sharing-invite-error">
                {inviteError}
              </p>
            )}
            <button
              type="submit"
              className="sharing-invite-submit"
              disabled={inviting || !inviteEmail.trim()}
            >
              {inviting ? 'Sending…' : 'Send Invite'}
            </button>
          </form>
        </section>
      )}

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
