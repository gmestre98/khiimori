import { useState } from 'react'
import { Link } from 'react-router-dom'
import { localToday } from '../lib/format'
import { Icon } from '../components/ui/Icon'
import { buildDayMetas } from './tripDays'
import { TripTravelogue } from './TripTravelogue'
import { hasContent, useTravelogue } from './travelogue'
import { useTripShell } from './useTripShell'

// TripJournalPage is the trip's Journal tab (/trips/:id/journal): the
// travelogue as Days or Photos, with a strip showing which days have been
// written and a shortcut into today's (or day 1's) journal.
export function TripJournalPage() {
  const { trip } = useTripShell()
  const [view, setView] = useState<'days' | 'photos'>('days')
  const { summaries, error } = useTravelogue(trip)

  const today = localToday()
  const target =
    today < trip.start_date ? trip.start_date : today > trip.end_date ? trip.end_date : today
  const metas = summaries
    ? buildDayMetas(
        summaries.map((s) => s.date),
        summaries.map((s) => s.day),
      )
    : null
  const writtenCount = summaries ? summaries.filter(hasContent).length : 0
  const startLabel = new Date(trip.start_date + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })

  return (
    <section className="fg-screen journal-page" aria-labelledby="journal-title">
      <div className="fg-screen-head">
        <h1 id="journal-title" className="fg-page-title">
          Journal
        </h1>
        <div className="seg" role="group" aria-label="Journal view">
          <button
            type="button"
            className="seg-btn"
            aria-pressed={view === 'days'}
            onClick={() => setView('days')}
          >
            Days
          </button>
          <button
            type="button"
            className="seg-btn"
            aria-pressed={view === 'photos'}
            onClick={() => setView('photos')}
          >
            Photos
          </button>
        </div>
      </div>

      {summaries && metas && (
        <div className="journal-strip-wrap">
          <ol className="journal-strip" aria-label="Days written">
            {summaries.map((s) => (
              <li
                key={s.date}
                className={
                  hasContent(s)
                    ? 'journal-strip-day journal-strip-day--written'
                    : 'journal-strip-day'
                }
                style={{ '--country': metas[s.index].color } as React.CSSProperties}
                title={`Day ${s.index + 1}${hasContent(s) ? ' — written' : ''}`}
              >
                <span className="visually-hidden">
                  Day {s.index + 1}: {hasContent(s) ? 'written' : 'not written'}
                </span>
              </li>
            ))}
          </ol>
          <div className="journal-strip-caption">
            <span>
              {writtenCount} of {summaries.length} days written
            </span>
            <span>Starts {startLabel}</span>
          </div>
        </div>
      )}

      <Link
        to={`/trips/${trip.id}/journal/${target}`}
        state={{ trip }}
        className="fg-btn fg-btn--primary journal-write-btn"
      >
        <Icon name="camera" size={18} />
        Add photos or write about {target === today ? 'today' : 'a day'}
      </Link>

      {error ? (
        <p role="alert" className="fg-error">
          Could not load the travelogue.
        </p>
      ) : summaries === null ? (
        <p className="fg-loading" aria-busy="true">
          Loading travelogue…
        </p>
      ) : (
        <TripTravelogue trip={trip} view={view} summaries={summaries} />
      )}
    </section>
  )
}
