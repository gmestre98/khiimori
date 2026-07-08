import { useEffect, useId, useRef, useState } from 'react'
import { fetchAutocomplete, geocodeLocation, type Suggestion } from '../lib/api'

// GEOCODE_DEBOUNCE_MS delays the live location check while the user is still
// typing so we issue one geocode per pause rather than one per keystroke.
const GEOCODE_DEBOUNCE_MS = 600

// SUGGEST_DEBOUNCE_MS / SUGGEST_MIN_CHARS tune the autocomplete: fire a snappy
// request after a short pause, but only once there's enough to match against
// (avoids noisy one/two-letter queries and needless Places billing).
const SUGGEST_DEBOUNCE_MS = 250
const SUGGEST_MIN_CHARS = 3

// GeoResult is the outcome of a completed geocode check, keyed by the exact
// query string it was run for so a stale result (from an earlier keystroke)
// isn't shown against newer input.
type GeoResult = { query: string; kind: 'found' | 'notfound' | 'unchecked' }

// LocationField is a combobox: as the user types it offers place suggestions
// (Google Places via the geo proxy) and, in parallel, runs a live geocode check
// that surfaces a small status line ("Found" / "couldn't place this"). Picking a
// suggestion fills the exact place string, so what lands on the map is never a
// surprise. Advisory only — saving is never blocked. It is shared by the plan
// timeline composer and the stay form so both places feel identical.
export function LocationField({
  value,
  onChange,
  disabled,
  label = 'Location',
  placeholder = 'e.g. Louvre, Paris',
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  label?: string
  placeholder?: string
}) {
  // Only async results live in state; immediate idle/checking states are derived
  // during render so effects never call setState synchronously.
  const [result, setResult] = useState<GeoResult | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  // After a suggestion is chosen, skip the next fetch so the list doesn't
  // immediately reopen against the value we just filled in.
  const justSelected = useRef(false)
  // Skip the first suggestions fetch so opening the edit form for an item that
  // already has a location doesn't pop the dropdown before the user types.
  const skipInitialSuggest = useRef(true)
  const inputId = useId()
  const hintId = useId()
  const listboxId = useId()

  const trimmed = value.trim()

  // Live geocode feedback.
  useEffect(() => {
    if (!trimmed) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      geocodeLocation(trimmed, controller.signal)
        .then((coords) => {
          if (controller.signal.aborted) return
          setResult({ query: trimmed, kind: coords ? 'found' : 'notfound' })
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
          // Auth failures and transient errors shouldn't be shown as "not a real
          // place" — fall back to a neutral state.
          setResult({ query: trimmed, kind: 'unchecked' })
        })
    }, GEOCODE_DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [trimmed])

  // Place suggestions.
  useEffect(() => {
    if (skipInitialSuggest.current) {
      skipInitialSuggest.current = false
      return
    }
    if (justSelected.current) {
      justSelected.current = false
      return
    }
    if (trimmed.length < SUGGEST_MIN_CHARS) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetchAutocomplete(trimmed, controller.signal)
        .then((list) => {
          if (controller.signal.aborted) return
          setSuggestions(list)
          setActiveIdx(-1)
          setOpen(list.length > 0)
        })
        .catch(() => {
          // A failed suggestion fetch is non-critical — the field still works.
        })
    }, SUGGEST_DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [trimmed])

  function selectSuggestion(s: Suggestion) {
    justSelected.current = true
    onChange(s.description)
    setSuggestions([])
    setOpen(false)
    setActiveIdx(-1)
  }

  function handleChange(next: string) {
    onChange(next)
    if (next.trim().length < SUGGEST_MIN_CHARS) {
      setSuggestions([])
      setOpen(false)
    } else {
      setOpen(true)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      if (e.key === 'ArrowDown' && suggestions.length > 0) {
        setOpen(true)
        setActiveIdx(0)
        e.preventDefault()
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIdx((i) => (i + 1) % suggestions.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
        break
      case 'Enter':
        if (activeIdx >= 0) {
          // Prevent the Enter from submitting the surrounding form.
          e.preventDefault()
          selectSuggestion(suggestions[activeIdx])
        }
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        break
    }
  }

  // Derive what to show: idle when empty, the matched result once it lands, and
  // "checking" in between (typing, or waiting on a result for the current query).
  const statusKind: 'idle' | 'checking' | 'found' | 'notfound' | 'unchecked' = !trimmed
    ? 'idle'
    : result?.query === trimmed
      ? result.kind
      : 'checking'

  const showList = open && suggestions.length > 0

  return (
    <div className="form-field location-field">
      <label className="form-field-label" htmlFor={inputId}>
        {label}
      </label>
      <div className="location-combobox">
        <input
          id={inputId}
          className="form-input"
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => setOpen(false)}
          placeholder={placeholder}
          disabled={disabled}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            showList && activeIdx >= 0 ? `${listboxId}-opt-${activeIdx}` : undefined
          }
          aria-describedby={hintId}
        />
        {showList && (
          <ul className="location-suggestions" id={listboxId} role="listbox">
            {suggestions.map((s, i) => (
              <li
                key={s.place_id || s.description}
                id={`${listboxId}-opt-${i}`}
                role="option"
                aria-selected={i === activeIdx}
                className={[
                  'location-suggestion',
                  i === activeIdx ? 'location-suggestion--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                // Keep focus on the input so onBlur doesn't close before click.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSuggestion(s)}
              >
                {s.description}
              </li>
            ))}
          </ul>
        )}
      </div>
      <span
        id={hintId}
        className={`location-status location-status--${statusKind}`}
        aria-live="polite"
      >
        {statusKind === 'idle' && 'Add a place to pin it on the day’s map.'}
        {statusKind === 'checking' && 'Checking location…'}
        {statusKind === 'found' && '✓ Found — this will show on the map.'}
        {statusKind === 'notfound' &&
          '⚠ We couldn’t place this. Try adding a city or country, e.g. “Louvre, Paris”.'}
        {statusKind === 'unchecked' && 'Saved — we’ll place it on the map when we can.'}
      </span>
    </div>
  )
}
