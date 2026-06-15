import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ProfileValidationError, UnauthorizedError, updateProfile } from '../lib/api'

const THEMES = ['system', 'light', 'dark'] as const

// Profile views and edits the signed-in user's profile (gated route, S3). It
// reads the current profile from the auth context — populated by the GET /me
// session check (Epic 04 S1) — and saves edits via PATCH /me (Epic 04 S2),
// updating the context so changes reflect immediately across the app.
// default_currency is shown read-only (always EUR) with no input.
export function Profile() {
  const { user, setProfile } = useAuth()

  // RequireAuth guarantees an authenticated user here; guard defensively.
  const [form, setForm] = useState(() => ({
    name: user?.name ?? '',
    avatar: user?.avatar ?? '',
    home_base: user?.home_base ?? '',
    theme: user?.theme ?? 'system',
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  if (!user) return null

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setSaved(false)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const updated = await updateProfile(form)
      setProfile(updated) // reflect immediately across the app (greeting, etc.)
      setForm({
        name: updated.name,
        avatar: updated.avatar,
        home_base: updated.home_base,
        theme: updated.theme,
      })
      setSaved(true)
    } catch (err) {
      if (err instanceof ProfileValidationError) {
        setError(err.message)
      } else if (!(err instanceof UnauthorizedError)) {
        // A 401 is handled centrally (re-auth); anything else is a save failure.
        setError('Could not save your profile. Please try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="profile">
      <h2>Profile</h2>
      <form onSubmit={(e) => void onSubmit(e)} className="profile-form">
        <label>
          Name
          <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </label>

        <label>
          Avatar URL
          <input
            type="url"
            value={form.avatar}
            onChange={(e) => set('avatar', e.target.value)}
            placeholder="https://…"
          />
        </label>

        <label>
          Home base
          <input
            type="text"
            value={form.home_base}
            onChange={(e) => set('home_base', e.target.value)}
          />
        </label>

        <label>
          Theme
          <select value={form.theme} onChange={(e) => set('theme', e.target.value)}>
            {THEMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        {/* Read-only identity + currency — not editable in v1. */}
        <p className="profile-readonly">
          Email: <strong>{user.email}</strong>
        </p>
        <p className="profile-readonly">
          Currency: <strong>{user.default_currency}</strong> <span>(fixed)</span>
        </p>

        {error && (
          <p role="alert" className="auth-error">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="profile-saved">
            Saved.
          </p>
        )}

        <div className="profile-actions">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <Link to="/">Back</Link>
        </div>
      </form>
    </section>
  )
}
