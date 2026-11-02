import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Day, Photo, Trip } from '../lib/api'
import { PreviewImage } from '../journal/PreviewImage'
import { PhotoLightbox } from '../journal/PhotoGrid'
import { DateBox } from '../components/ui/DateBox'
import { buildDayMetas, type DayMeta } from './tripDays'
import { hasContent, type DaySummary } from './travelogue'

// whatHappened lists, for the chips under an entry: done items, things logged
// after the fact, and skipped/cancelled plans (struck through).
function whatHappened(day: Day) {
  const items = [...day.plan_items].sort(
    (a, b) => (a.actual_order ?? a.sort_order) - (b.actual_order ?? b.sort_order),
  )
  return items
    .filter((i) => i.status === 'done' || i.unplanned || i.status === 'skipped')
    .map((i) => ({
      id: i.id,
      title: i.title,
      kind: i.unplanned ? 'unplanned' : i.status === 'done' ? 'done' : 'skipped',
    }))
}

// TravelogueDay renders one day's entry: date box + place, a photo mosaic that
// opens the lightbox, the diary text and "what happened" chips.
function TravelogueDay({
  trip,
  summary,
  meta,
  onOpenPhoto,
}: {
  trip: Trip
  summary: DaySummary
  meta: DayMeta
  onOpenPhoto: (p: Photo) => void
}) {
  const planned = summary.day.plan_items.filter((i) => !i.unplanned)
  const doneCount = planned.filter((i) => i.status === 'done').length
  const unplanned = summary.day.plan_items.filter((i) => i.unplanned).length
  const chips = whatHappened(summary.day)
  const shown = summary.photos.slice(0, 3)
  const extra = summary.photos.length - shown.length
  return (
    <article className="journal-entry fg-card" aria-label={`Day ${summary.index + 1}`}>
      <header className="journal-entry-head">
        <DateBox date={summary.date} color={meta.color} size="md" showMonth />
        <span className="journal-entry-titles">
          <h2 className="journal-entry-place">
            <Link to={`/trips/${trip.id}/days/${summary.date}`} state={{ trip }}>
              {meta.place || `Day ${summary.index + 1}`}
            </Link>
          </h2>
          {planned.length + unplanned > 0 && (
            <span className="journal-entry-sub">
              {planned.length > 0 && `${doneCount} of ${planned.length} plans done`}
              {planned.length > 0 && unplanned > 0 && ' · '}
              {unplanned > 0 && `${unplanned} unplanned`}
            </span>
          )}
        </span>
      </header>

      {shown.length > 0 && (
        <div className={`journal-mosaic journal-mosaic--${shown.length}`}>
          {shown.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className="journal-mosaic-tile"
              onClick={() => onOpenPhoto(p)}
              aria-label={p.caption ? `Photo: ${p.caption}` : 'Open photo'}
            >
              <PreviewImage
                src={p.thumbnail_url || p.storage_url}
                preview={p.preview}
                alt={p.caption || 'Photo'}
                previewClassName="trip-journal-thumb-preview"
                imgClassName="trip-journal-thumb-img"
                loadedClassName="trip-journal-thumb-img--loaded"
              />
              {i === shown.length - 1 && extra > 0 && (
                <span className="journal-mosaic-more">+{extra}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {summary.body.trim() !== '' && <p className="journal-entry-body">{summary.body}</p>}

      {chips.length > 0 && (
        <div className="journal-entry-happened">
          <span className="fg-label">What happened</span>
          <ul className="journal-chips">
            {chips.map((c) => (
              <li key={c.id} className={`journal-chip journal-chip--${c.kind}`}>
                {c.kind === 'done' && <span aria-hidden="true">✓ </span>}
                {c.kind === 'unplanned' && <span aria-hidden="true">+ </span>}
                {c.title}
                {c.kind === 'skipped' && <span className="visually-hidden"> (skipped)</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  )
}

// TripTravelogue is the read view of the trip journal: Days (entries in order)
// or Photos (every photo grouped by day). It renders inside the Journal tab.
export function TripTravelogue({
  trip,
  view,
  summaries,
}: {
  trip: Trip
  view: 'days' | 'photos'
  summaries: DaySummary[]
}) {
  const [lightboxPhoto, setLightboxPhoto] = useState<Photo | null>(null)
  const metas = buildDayMetas(
    summaries.map((s) => s.date),
    summaries.map((s) => s.day),
  )
  const written = summaries.filter(hasContent)

  return (
    <section className="trip-travelogue" aria-label="Travelogue">
      {view === 'days' ? (
        written.length > 0 ? (
          <div className="journal-feed">
            {written.map((s) => (
              <TravelogueDay
                key={s.date}
                trip={trip}
                summary={s}
                meta={metas[s.index]}
                onOpenPhoto={setLightboxPhoto}
              />
            ))}
          </div>
        ) : (
          <p className="fg-empty">
            No journal entries yet. Open a day and switch to Journal to write about it and add
            photos — whatever you tick off in the plan shows up there too.
          </p>
        )
      ) : summaries.some((s) => s.photos.length > 0) ? (
        <div className="journal-photo-days">
          <span className="fg-label">All photos · grouped by day</span>
          {summaries
            .filter((s) => s.photos.length > 0)
            .map((s) => (
              <section
                key={s.date}
                className="journal-photo-day"
                aria-label={`Photos, day ${s.index + 1}`}
              >
                <h2 className="journal-photo-day-title">
                  {new Date(s.date + 'T00:00:00').toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                  })}
                  {metas[s.index].place ? ` · ${metas[s.index].place}` : ''}
                </h2>
                <div className="journal-photo-grid">
                  {s.photos.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="journal-photo-tile"
                      onClick={() => setLightboxPhoto(p)}
                      aria-label={p.caption ? `Photo: ${p.caption}` : 'Open photo'}
                    >
                      <PreviewImage
                        src={p.thumbnail_url || p.storage_url}
                        preview={p.preview}
                        alt={p.caption || 'Photo'}
                        previewClassName="trip-journal-thumb-preview"
                        imgClassName="trip-journal-thumb-img"
                        loadedClassName="trip-journal-thumb-img--loaded"
                      />
                    </button>
                  ))}
                </div>
              </section>
            ))}
        </div>
      ) : (
        <p className="fg-empty">No photos yet. Add some from a day’s Journal view.</p>
      )}
      {lightboxPhoto && (
        <PhotoLightbox photo={lightboxPhoto} onClose={() => setLightboxPhoto(null)} />
      )}
    </section>
  )
}
