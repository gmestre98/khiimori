export interface DayNavBarProps {
  /** All available dates in order (YYYY-MM-DD). */
  dates: string[]
  /** Currently selected date (YYYY-MM-DD). */
  currentDate: string
  /** Called when the user selects a different date. */
  onDateChange: (date: string) => void
  className?: string
}

export function DayNavBar({ dates, currentDate, onDateChange, className = '' }: DayNavBarProps) {
  const idx = dates.indexOf(currentDate)
  const hasPrev = idx > 0
  const hasNext = idx < dates.length - 1

  function prev() {
    if (hasPrev) onDateChange(dates[idx - 1])
  }

  function next() {
    if (hasNext) onDateChange(dates[idx + 1])
  }

  return (
    <nav
      className={['day-nav-bar', className].filter(Boolean).join(' ')}
      aria-label="Day navigation"
    >
      <button
        className={['day-nav-bar-btn', !hasPrev ? 'day-nav-bar-btn--disabled' : '']
          .filter(Boolean)
          .join(' ')}
        onClick={prev}
        disabled={!hasPrev}
        aria-label="Previous day"
      >
        ‹
      </button>

      <select
        className="day-nav-bar-select"
        value={currentDate}
        onChange={(e) => onDateChange(e.target.value)}
        aria-label="Select day"
      >
        {dates.map((d, i) => (
          <option key={d} value={d}>
            Day {i + 1} — {d}
          </option>
        ))}
      </select>

      <button
        className={['day-nav-bar-btn', !hasNext ? 'day-nav-bar-btn--disabled' : '']
          .filter(Boolean)
          .join(' ')}
        onClick={next}
        disabled={!hasNext}
        aria-label="Next day"
      >
        ›
      </button>
    </nav>
  )
}
