import { useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ProfileValidationError, UnauthorizedError, updateProfile } from '../lib/api'
import { Button, FormField, Input } from '../components/ui'

const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const

// initials derives a 1–2 letter avatar fallback from the name (or email).
function initials(name: string, email: string): string {
  const src = name.trim() || email.trim()
  if (!src) return '?'
  const parts = src.split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

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
  // Whether the avatar URL currently loads; false falls back to initials.
  const [avatarOk, setAvatarOk] = useState(true)

  const nameId = useId()
  const avatarId = useId()
  const homeId = useId()
  const themeLabelId = useId()

  if (!user) return null

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setSaved(false)
    if (key === 'avatar') setAvatarOk(true)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const updated = await updateProfile(form)
      setProfile(updated) // reflect immediately across the app (greeting, theme, etc.)
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
      <header className="profile-hero">
        <div className="profile-avatar">
          {form.avatar && avatarOk ? (
            <img src={form.avatar} alt="" onError={() => setAvatarOk(false)} />
          ) : (
            <span className="profile-avatar-initials" aria-hidden="true">
              {initials(form.name, user.email)}
            </span>
          )}
        </div>
        <div className="profile-hero-meta">
          <h2 className="profile-hero-name">{form.name.trim() || 'Your profile'}</h2>
          <p className="profile-hero-email">{user.email}</p>
        </div>
      </header>

      <form onSubmit={(e) => void onSubmit(e)} className="profile-form">
        <div className="profile-card">
          <FormField label="Name" htmlFor={nameId}>
            <Input
              id={nameId}
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Your name"
            />
          </FormField>

          <FormField label="Avatar URL" htmlFor={avatarId} hint="Link to a profile image">
            <Input
              id={avatarId}
              type="url"
              value={form.avatar}
              onChange={(e) => set('avatar', e.target.value)}
              placeholder="https://…"
            />
          </FormField>

          <FormField label="Home base" htmlFor={homeId} hint="Your usual departure city">
            <Input
              id={homeId}
              type="text"
              value={form.home_base}
              onChange={(e) => set('home_base', e.target.value)}
              placeholder="e.g. Lisbon"
            />
          </FormField>

          <div className="form-field">
            <span className="form-field-label" id={themeLabelId}>
              Theme
            </span>
            <div className="segmented" role="radiogroup" aria-labelledby={themeLabelId}>
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={form.theme === t.value}
                  className={[
                    'segmented-btn',
                    form.theme === t.value ? 'segmented-btn--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => set('theme', t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Read-only currency — not editable in v1. */}
          <dl className="profile-facts">
            <div className="profile-fact">
              <dt>Currency</dt>
              <dd>
                <strong>{user.default_currency}</strong>
                <span className="profile-fact-note"> · fixed</span>
              </dd>
            </div>
          </dl>
        </div>

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
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
          <Link to="/" className="btn btn-ghost btn-sm">
            Back to trips
          </Link>
        </div>
      </form>
    </section>
  )
}
