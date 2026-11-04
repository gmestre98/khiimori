import { useState } from 'react'
import type { Trip } from '../lib/api'
import { euroWhole } from '../lib/format'
import { INCLUDE_LABELS, isPaid, usePackages } from './packages'
import { PackageSheet } from './PackageSheet'
import type { TripDaysState } from './tripDays'

function rangeLabel(start: string, end: string): string {
  const f = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const days =
    Math.round(
      (new Date(end + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()) /
        86_400_000,
    ) + 1
  return `${f(start)} – ${f(end)} · ${days} ${days === 1 ? 'day' : 'days'}`
}

// MoneyPackages is the Money tab's Packages section: each package as one line
// (name, who it's booked with, dates, price, paid or how much is left, what's
// included, how many items it covers) and "Add a package". Tapping a package
// edits it.
export function MoneyPackages({
  trip,
  tripDays,
  onChanged,
}: {
  trip: Trip
  tripDays?: TripDaysState
  onChanged: () => void
}) {
  const packages = usePackages(trip.id)
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const current = editing && editing !== 'new' ? packages?.find((p) => p.id === editing) : undefined

  return (
    <section className="money-packages" aria-labelledby="money-packages-title">
      <div className="money-packages-head">
        <h2 id="money-packages-title" className="fg-label fg-section-label">
          Packages{packages && packages.length > 0 ? ` · ${packages.length}` : ''}
        </h2>
        <button type="button" className="fg-link-btn" onClick={() => setEditing('new')}>
          + Add a package
        </button>
      </div>
      {packages && packages.length === 0 && (
        <p className="money-packages-empty">
          Paid one price for several days, like a tour? Add it as a package so it’s counted once and
          the days it covers show what’s included.
        </p>
      )}
      {packages?.map((p) => {
        const paid = isPaid(p)
        const linked = p.stay_ids.length + p.plan_item_ids.length
        return (
          <button
            key={p.id}
            type="button"
            className="money-package"
            onClick={() => setEditing(p.id)}
            aria-label={`Edit package ${p.name}`}
          >
            <span className="money-package-top">
              <span className="money-package-titles">
                <span className="money-package-name">{p.name}</span>
                <span className="money-package-sub">
                  {[p.provider, rangeLabel(p.start_date, p.end_date)].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="money-package-price">{euroWhole(p.total_cost)}</span>
            </span>
            <span className="money-package-tags">
              <span className={paid ? 'tag tag--ok' : 'tag tag--warn'}>
                {paid
                  ? 'Paid'
                  : `${euroWhole(p.paid_amount)} paid · ${euroWhole(p.total_cost - p.paid_amount)} left${p.balance_due ? ` by ${new Date(p.balance_due + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}`}
              </span>
              {p.includes.length > 0 && (
                <span className="tag tag--accent">
                  {p.includes.map((i) => INCLUDE_LABELS[i] ?? i).join(' · ')}
                </span>
              )}
            </span>
            <span className="money-package-sub">
              {linked === 0
                ? 'No items linked yet'
                : `${linked} ${linked === 1 ? 'item' : 'items'} on those days marked included`}
            </span>
          </button>
        )
      })}
      {editing && (
        <PackageSheet
          tripId={trip.id}
          tripStart={trip.start_date}
          tripEnd={trip.end_date}
          dates={tripDays?.dates ?? []}
          days={tripDays?.days}
          pkg={current}
          onClose={() => setEditing(null)}
          onSaved={onChanged}
        />
      )}
    </section>
  )
}
