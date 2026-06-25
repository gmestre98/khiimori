import { useEffect, useState } from 'react'
import { deactivateUser, fetchAdminUsers, type AdminUser } from '../lib/api'

// AdminUsersPage lists all users from the admin backoffice (M08.5 S2).
// Deactivation action is wired here (S3).
export function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deactivating, setDeactivating] = useState<string | null>(null)

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

  async function handleDeactivate(userID: string) {
    if (!confirm('Deactivate this user? They will not be able to sign in.')) return
    setDeactivating(userID)
    try {
      await deactivateUser(userID)
      setUsers((prev) => prev.map((u) => (u.id === userID ? { ...u, active: false } : u)))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to deactivate user')
    } finally {
      setDeactivating(null)
    }
  }

  if (loading) return <p role="status">Loading users…</p>
  if (error) return <p role="alert">Error: {error}</p>

  return (
    <div>
      <h3>Users ({users.length})</h3>
      <table>
        <thead>
          <tr>
            <th>Email</th>
            <th>Name</th>
            <th>Admin</th>
            <th>Active</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{u.name}</td>
              <td>{u.is_admin ? 'Yes' : 'No'}</td>
              <td>{u.active ? 'Active' : 'Deactivated'}</td>
              <td>
                {u.active && (
                  <button
                    onClick={() => handleDeactivate(u.id)}
                    disabled={deactivating === u.id}
                    aria-label={`Deactivate ${u.email}`}
                  >
                    {deactivating === u.id ? 'Deactivating…' : 'Deactivate'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
