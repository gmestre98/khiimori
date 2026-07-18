import { useEffect, useMemo, useState } from 'react'
import { deactivateUser, fetchAdminUsers, reactivateUser, type AdminUser } from '../lib/api'
import { AdminAvatar } from './adminShared'

type Filter = 'all' | 'active' | 'deactivated' | 'admins'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'deactivated', label: 'Deactivated' },
  { key: 'admins', label: 'Admins' },
]

// formatJoined turns an RFC3339 timestamp into "12 Jan 2026"; empty stays "—".
function formatJoined(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

// AdminUsersPage lists all users (M08.5 S2) with search + status filter and the
// deactivate action (S3). Reactivation and richer per-user columns (joined,
// trip count, last seen) land in follow-up PRs alongside their backend fields.
export function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyID, setBusyID] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    let cancelled = false
    fetchAdminUsers()
      .then((data) => {
        if (!cancelled) {
          setUsers(data)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load users')
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter((u) => {
      if (filter === 'active' && !u.active) return false
      if (filter === 'deactivated' && u.active) return false
      if (filter === 'admins' && !u.is_admin) return false
      if (q && !`${u.name} ${u.email}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [users, query, filter])

  async function handleDeactivate(userID: string, email: string) {
    if (!confirm(`Deactivate ${email}? They won't be able to sign in.`)) return
    setBusyID(userID)
    try {
      await deactivateUser(userID)
      setUsers((prev) => prev.map((u) => (u.id === userID ? { ...u, active: false } : u)))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to deactivate user')
    } finally {
      setBusyID(null)
    }
  }

  async function handleReactivate(userID: string) {
    setBusyID(userID)
    try {
      await reactivateUser(userID)
      setUsers((prev) => prev.map((u) => (u.id === userID ? { ...u, active: true } : u)))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reactivate user')
    } finally {
      setBusyID(null)
    }
  }

  return (
    <>
      <div className="admin-top">
        <h1>Users</h1>
        <p>
          {users.length} registered · {users.filter((u) => u.active).length} active
        </p>
      </div>

      <div className="admin-toolbar">
        <div className="admin-search">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email"
            aria-label="Search users"
          />
        </div>
        <div className="admin-seg" role="tablist" aria-label="Filter users">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={filter === f.key ? 'on' : ''}
              onClick={() => setFilter(f.key)}
              role="tab"
              aria-selected={filter === f.key}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <p className="admin-state" role="status">
          Loading users…
        </p>
      )}
      {error && (
        <p className="admin-state" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && (
        <div className="admin-tbl-wrap">
          <table className="admin-tbl">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th className="num">Trips</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={6} className="admin-empty">
                    No users match.
                  </td>
                </tr>
              )}
              {shown.map((u) => (
                <tr key={u.id} className={u.active ? '' : 'row-dim'}>
                  <td>
                    <div className="admin-u">
                      <AdminAvatar name={u.name} email={u.email} />
                      <div>
                        <div className="un">{u.name || u.email}</div>
                        <div className="ue">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {u.is_admin ? (
                      <span className="admin-badge-admin">Admin</span>
                    ) : (
                      <span className="admin-badge-mem">Member</span>
                    )}
                  </td>
                  <td>
                    <span className="admin-st">
                      <span
                        className="admin-dot"
                        style={{ background: u.active ? 'var(--ok)' : 'var(--faint)' }}
                      />
                      {u.active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td className="admin-mini" style={{ color: 'var(--ink-2)' }}>
                    {formatJoined(u.joined)}
                  </td>
                  <td className="num">{u.trip_count ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    {u.is_admin ? null : u.active ? (
                      <button
                        className="admin-rowbtn danger"
                        onClick={() => handleDeactivate(u.id, u.email)}
                        disabled={busyID === u.id}
                        aria-label={`Deactivate ${u.email}`}
                      >
                        {busyID === u.id ? 'Deactivating…' : 'Deactivate'}
                      </button>
                    ) : (
                      <button
                        className="admin-rowbtn"
                        onClick={() => handleReactivate(u.id)}
                        disabled={busyID === u.id}
                        aria-label={`Reactivate ${u.email}`}
                      >
                        {busyID === u.id ? 'Reactivating…' : 'Reactivate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
