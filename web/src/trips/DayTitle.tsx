import { useState } from 'react'
import { setDayTitle, UnauthorizedError } from '../lib/api'
import { Icon } from '../components/ui/Icon'

const MAX_TITLE = 80

// DayTitle is a day's heading with a rename control. It shows the traveller's
// own title when set, otherwise the automatic place name. Editing saves on
// Enter or "Save"; clearing the box goes back to the place name; Escape cancels.
export function DayTitle({
  tripId,
  date,
  title,
  place,
  onSaved,
  children,
}: {
  tripId: string
  date: string
  // title is the custom title ("" when unset); place is the automatic name.
  title: string
  place: string
  onSaved: (title: string) => void
  // children render after the heading text (e.g. the cache status).
  children?: React.ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function start() {
    setValue(title || place)
    setError(null)
    setEditing(true)
  }

  async function save(e?: React.FormEvent) {
    e?.preventDefault()
    const next = value.trim()
    // Typing the automatic name back in is the same as having no custom title.
    const stored = next === place ? '' : next
    if (stored === title) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const saved = await setDayTitle(tripId, date, stored)
      onSaved(saved)
      setEditing(false)
    } catch (err) {
      if (err instanceof UnauthorizedError) return
      setError(
        err instanceof Error && err.message.startsWith('API returned HTTP 404')
          ? "You can't rename days on this trip."
          : 'Could not save the title. Try again.',
      )
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <form className="day-title-edit" onSubmit={save} aria-label="Rename this day">
        <input
          className="day-title-input"
          aria-label="Day title"
          value={value}
          maxLength={MAX_TITLE}
          placeholder={place || 'Name this day'}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditing(false)
          }}
        />
        <div className="day-title-edit-actions">
          <button type="submit" className="fg-btn fg-btn--primary day-title-btn" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="fg-btn fg-btn--quiet day-title-btn"
            onClick={() => setEditing(false)}
            disabled={saving}
          >
            Cancel
          </button>
          <span className="day-title-hint">
            {place ? `Leave it empty to use “${place}”.` : 'Leave it empty to use the place name.'}
          </span>
        </div>
        {error && (
          <p role="alert" className="fg-error day-title-error">
            {error}
          </p>
        )}
      </form>
    )
  }

  return (
    <div className="day-title-row">
      <h1 className="day-title-place">
        {title || place}
        {children}
      </h1>
      <button
        type="button"
        className="day-title-rename"
        onClick={start}
        aria-label="Rename this day"
      >
        <Icon name="edit" size={16} />
      </button>
    </div>
  )
}
