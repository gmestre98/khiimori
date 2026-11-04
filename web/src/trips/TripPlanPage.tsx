import { Link } from 'react-router-dom'
import { fetchBacklog } from '../lib/api'
import { useCachedResource } from '../lib/useCachedResource'
import { cacheKeys } from '../lib/cacheKeys'
import { DateBox } from '../components/ui/DateBox'
import { Icon } from '../components/ui/Icon'
import { buildDayMetas, planSummary, useTripDays, type DayMeta } from './tripDays'
import { useTripShell } from './useTripShell'
import { INCLUDE_LABELS, isPaid, packageForDate, usePackages } from './packages'
import type { TripPackage } from '../lib/api'

// groupByPackage splits the days into runs: days a package covers sit together
// under it; other days stand alone.
function groupByPackage(
  metas: DayMeta[],
  packages: TripPackage[] | null,
): { pkg?: TripPackage; metas: DayMeta[] }[] {
  const out: { pkg?: TripPackage; metas: DayMeta[] }[] = []
  for (const m of metas) {
    const pkg = packageForDate(packages, m.date)
    const last = out[out.length - 1]
    if (last && last.pkg?.id === pkg?.id) last.metas.push(m)
    else out.push({ pkg, metas: [m] })
  }
  return out
}

// DayRow is one row of the trip's day list: the date box (country-coloured,
// dashed when empty), the place/title, a one-line summary and badges.
function DayRow({ meta, tripLink }: { meta: DayMeta; tripLink: (date: string) => string }) {
  const { day } = meta
  const planned = day ? day.plan_items.filter((i) => !i.unplanned) : []
  const done = planned.filter((i) => i.status === 'done').length
  const summary = day ? planSummary(day) : ''
  const title = meta.title || (meta.hasPlans ? `${planned.length} plans` : `Day ${meta.index + 1}`)
  const date = new Date(meta.date + 'T00:00:00')
  return (
    <li>
      <Link
        to={tripLink(meta.date)}
        className={meta.hasPlans ? 'days-row' : 'days-row days-row--empty'}
        aria-label={`Day ${meta.index + 1}, ${date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}${meta.title ? `, ${meta.title}` : ''}${meta.hasPlans ? '' : ' — nothing planned'}`}
      >
        <DateBox date={meta.date} color={meta.color} empty={!meta.hasPlans} />
        <span className="days-row-body">
          <span className="days-row-title">{title}</span>
          {meta.hasPlans ? (
            summary && <span className="days-row-sub">{summary}</span>
          ) : (
            <span className="days-row-sub days-row-sub--muted">{summary || 'Nothing planned'}</span>
          )}
        </span>
        <span className="days-row-badges">
          {done > 0 && (
            <span className="tag tag--ok">
              {done}/{planned.length}
            </span>
          )}
          <Icon name="chevron-right" size={16} />
        </span>
      </Link>
    </li>
  )
}

// TripPlanPage is the trip's Days screen (/trips/:tripId/plan): a planning
// progress strip, ONE list of every day (tap a day to plan it), and a link
// card to the backlog. It replaces the old rail + whole-trip accordion, which
// listed every day twice.
export function TripPlanPage() {
  const { trip, tripDays: shellDays } = useTripShell()
  // The shell already loads every day; fall back to loading here when this
  // page is rendered outside the shell (tests).
  const ownDays = useTripDays(trip, undefined, !shellDays)
  const tripDays = shellDays ?? ownDays
  const { data: backlog } = useCachedResource(cacheKeys.backlog(trip.id), (signal) =>
    fetchBacklog(trip.id, signal),
  )

  const metas = tripDays.days ? buildDayMetas(tripDays.dates, tripDays.days) : null
  const packages = usePackages(trip.id)
  const plannedCount = metas ? metas.filter((m) => m.hasPlans).length : 0
  const total = tripDays.dates.length
  const tripLink = (date: string) => `/trips/${trip.id}/days/${date}`

  return (
    <section className="fg-screen days-page" aria-label={`Days for ${trip.name}`}>
      <h2 className="visually-hidden">Days</h2>
      {tripDays.error && !metas ? (
        <p role="alert" className="fg-error">
          Could not load the trip plan.
        </p>
      ) : metas === null ? (
        <p className="fg-loading" aria-busy="true">
          Loading trip plan…
        </p>
      ) : (
        <>
          <div className="days-progress" role="group" aria-label="Planning progress">
            <div className="days-progress-head">
              <span className="days-progress-title">
                {plannedCount} of {total} {total === 1 ? 'day has' : 'days have'} plans
              </span>
              {total - plannedCount > 0 && (
                <span className="days-progress-meta">{total - plannedCount} empty</span>
              )}
            </div>
            <div className="days-progress-ticks" aria-hidden="true">
              {metas.map((m) => (
                <span key={m.date} data-on={m.hasPlans} />
              ))}
            </div>
            {/* Drafting empty days from the route is a future backend feature;
                the hook lives here so it can land without a layout change. */}
          </div>

          <ol className="days-list" aria-label="Days">
            {groupByPackage(metas, packages).map((g) =>
              g.pkg ? (
                <li key={`pkg-${g.pkg.id}-${g.metas[0].date}`} className="days-pkg">
                  <section aria-label={g.pkg.name}>
                    <Link to={`/trips/${trip.id}/budget`} className="days-pkg-head">
                      <span className="days-pkg-titles">
                        <span className="days-pkg-name">{g.pkg.name}</span>
                        <span className="days-pkg-sub">
                          {[
                            g.pkg.provider,
                            `${g.metas.length} ${g.metas.length === 1 ? 'day' : 'days'}`,
                            g.pkg.includes
                              .map((i) => INCLUDE_LABELS[i]?.toLowerCase() ?? i)
                              .join(', '),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      <span className={isPaid(g.pkg) ? 'tag tag--ok' : 'tag tag--warn'}>
                        {isPaid(g.pkg) ? 'Paid' : 'Part paid'}
                      </span>
                    </Link>
                    <ol className="days-list days-list--pkg">
                      {g.metas.map((m) => (
                        <DayRow key={m.date} meta={m} tripLink={tripLink} />
                      ))}
                    </ol>
                  </section>
                </li>
              ) : (
                g.metas.map((m) => <DayRow key={m.date} meta={m} tripLink={tripLink} />)
              ),
            )}
          </ol>

          <Link to={`/trips/${trip.id}/backlog`} state={{ trip }} className="fg-link-card">
            <span>
              <span className="fg-link-card-title">Backlog</span>
              <br />
              <span className="fg-link-card-sub">
                {backlog == null
                  ? 'Ideas not on a day yet'
                  : backlog.length === 0
                    ? 'No ideas parked yet'
                    : `${backlog.length} ${backlog.length === 1 ? 'idea' : 'ideas'} not on a day yet`}
              </span>
            </span>
            <Icon name="chevron-right" size={16} />
          </Link>
        </>
      )}
    </section>
  )
}
