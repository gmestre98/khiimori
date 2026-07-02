import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ProfileValidationError, UnauthorizedError, updateProfile } from '../lib/api'
import { Button, FormField, Input } from '../components/ui'
import { applyTheme } from '../design/theme'

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

// AVATAR_SIZE is the square size (px) the picked image is downscaled to. Small
// enough to store inline as a data URL (a few KB) while staying crisp on retina.
const AVATAR_SIZE = 192

// fileToAvatarDataURL loads an image file, centre-crops it to a square, downscales
// to AVATAR_SIZE, and returns a compact JPEG data URL. Keeping the resize on the
// client means the avatar is a small self-contained string — no upload/serving
// infrastructure needed.
async function fileToAvatarDataURL(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('decode failed'))
    el.src = dataUrl
  })
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_SIZE
  canvas.height = AVATAR_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  const scale = Math.max(AVATAR_SIZE / img.width, AVATAR_SIZE / img.height)
  const w = img.width * scale
  const h = img.height * scale
  ctx.drawImage(img, (AVATAR_SIZE - w) / 2, (AVATAR_SIZE - h) / 2, w, h)
  return canvas.toDataURL('image/jpeg', 0.82)
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
  // Whether the current avatar renders; false falls back to initials.
  const [avatarOk, setAvatarOk] = useState(true)
  const [avatarError, setAvatarError] = useState<string | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const nameId = useId()
  const homeId = useId()
  const themeLabelId = useId()

  // Preview the selected theme live so the choice is visible before saving.
  // On unmount, restore the last *saved* theme so an unsaved preview doesn't
  // leak to the rest of the app.
  const savedTheme = useRef(user?.theme ?? 'system')
  useEffect(() => {
    savedTheme.current = user?.theme ?? 'system'
  }, [user?.theme])
  useEffect(() => {
    applyTheme(form.theme)
  }, [form.theme])
  useEffect(() => {
    return () => applyTheme(savedTheme.current)
  }, [])

  if (!user) return null

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setSaved(false)
    if (key === 'avatar') setAvatarOk(true)
  }

  async function onPickAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // let the user re-pick the same file later
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setAvatarError('Please choose an image file.')
      return
    }
    setAvatarError(null)
    try {
      set('avatar', await fileToAvatarDataURL(file))
    } catch {
      setAvatarError('Could not read that image. Try another.')
    }
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
        <button
          type="button"
          className="profile-avatar profile-avatar--edit"
          onClick={() => fileRef.current?.click()}
          aria-label="Change profile photo"
        >
          {form.avatar && avatarOk ? (
            <img src={form.avatar} alt="" onError={() => setAvatarOk(false)} />
          ) : (
            <span className="profile-avatar-initials" aria-hidden="true">
              {initials(form.name, user.email)}
            </span>
          )}
          <span className="profile-avatar-badge" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                d="M4 8h3l2-2h6l2 2h3v11H4z"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="13" r="3.2" strokeWidth="1.8" />
            </svg>
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="visually-hidden"
          onChange={(e) => void onPickAvatar(e)}
        />
        <div className="profile-hero-meta">
          <h2 className="profile-hero-name">{form.name.trim() || 'Your profile'}</h2>
          <p className="profile-hero-email">{user.email}</p>
          <button
            type="button"
            className="profile-avatar-change"
            onClick={() => fileRef.current?.click()}
          >
            Change photo
          </button>
          {avatarError && (
            <p role="alert" className="profile-avatar-error">
              {avatarError}
            </p>
          )}
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
