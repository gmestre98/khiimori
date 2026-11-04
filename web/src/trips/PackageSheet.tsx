import { useMemo, useState } from 'react'
import {
  createPackage,
  deletePackage,
  updatePackage,
  UnauthorizedError,
  type Day,
  type PackageInclude,
  type PackageInput,
  type TripPackage,
} from '../lib/api'
import { Sheet } from '../components/ui'
import { coverDays, removePackage, upsertPackage, INCLUDE_LABELS } from './packages'

const INCLUDES: PackageInclude[] = [
  'beds',
  'transport',
  'meals',
  'guide',
  'fees',
  'activities',
  'flights',
]

function parseAmount(s: string): number | null {
  const n = Number(s.replace(',', '.').trim())
  return s.trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null
}

// PackageSheet adds or edits a package in two steps: the details (name, who
// it's booked with, price, payment, dates, what's included, link), then what it
// covers (the stays and plan items already on those days, ticked by default
// for a new package). Saving updates every screen through the shared store.
export function PackageSheet({
  tripId,
  tripStart,
  tripEnd,
  dates,
  days,
  pkg,
  onClose,
  onSaved,
}: {
  tripId: string
  tripStart: string
  tripEnd: string
  dates: string[]
  days: (Day | null)[] | null | undefined
  pkg?: TripPackage
  onClose: () => void
  onSaved?: () => void
}) {
  const editing = !!pkg
  const [step, setStep] = useState<'details' | 'covers'>('details')
  const [name, setName] = useState(pkg?.name ?? '')
  const [provider, setProvider] = useState(pkg?.provider ?? '')
  const [total, setTotal] = useState(pkg ? String(pkg.total_cost) : '')
  const [deposit, setDeposit] = useState(pkg ? pkg.paid_amount < pkg.total_cost : false)
  const [paid, setPaid] = useState(
    pkg && pkg.paid_amount < pkg.total_cost ? String(pkg.paid_amount) : '',
  )
  const [due, setDue] = useState(pkg?.balance_due ?? '')
  const [start, setStart] = useState(pkg?.start_date ?? tripStart)
  const [end, setEnd] = useState(pkg?.end_date ?? tripEnd)
  const [includes, setIncludes] = useState<Set<PackageInclude>>(
    new Set(pkg?.includes ?? ['beds', 'transport']),
  )
  const [link, setLink] = useState(pkg?.link ?? '')
  // Which covered rows are ticked. Unset until the covers step first opens.
  const [ticked, setTicked] = useState<Set<string> | null>(
    pkg
      ? new Set([
          ...pkg.stay_ids.map((id) => `stay:${id}`),
          ...pkg.plan_item_ids.map((id) => `item:${id}`),
        ])
      : null,
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const cover = useMemo(() => coverDays(dates, days, start, end), [dates, days, start, end])

  const totalNum = parseAmount(total)
  const paidNum = deposit ? parseAmount(paid) : totalNum
  const detailsError = !name.trim()
    ? 'Give the package a name.'
    : totalNum == null
      ? 'Enter the total price.'
      : !start || !end || start > end
        ? 'The first day must be on or before the last day.'
        : deposit && (paidNum == null || paidNum > (totalNum ?? 0))
          ? 'Paid so far must be between 0 and the total.'
          : null

  function goCovers() {
    if (detailsError) {
      setError(detailsError)
      return
    }
    setError(null)
    // A new package starts with everything on its days ticked.
    if (ticked == null) setTicked(new Set(cover.flatMap((d) => d.rows.map((r) => r.key))))
    setStep('covers')
  }

  async function save() {
    if (detailsError) {
      setError(detailsError)
      setStep('details')
      return
    }
    const keys = ticked ?? new Set<string>()
    const inRange = new Set(cover.flatMap((d) => d.rows.map((r) => r.key)))
    const chosen = [...keys].filter((k) => inRange.has(k))
    const input: PackageInput = {
      name: name.trim(),
      provider: provider.trim(),
      link: link.trim(),
      total_cost: totalNum!,
      paid_amount: paidNum!,
      balance_due: deposit && due ? due : null,
      start_date: start,
      end_date: end,
      includes: INCLUDES.filter((i) => includes.has(i)),
      stay_ids: chosen.filter((k) => k.startsWith('stay:')).map((k) => k.slice(5)),
      plan_item_ids: chosen.filter((k) => k.startsWith('item:')).map((k) => k.slice(5)),
    }
    setSaving(true)
    setError(null)
    try {
      const saved = pkg
        ? await updatePackage(tripId, pkg.id, input)
        : await createPackage(tripId, input)
      upsertPackage(tripId, saved)
      onSaved?.()
      onClose()
    } catch (err) {
      if (err instanceof UnauthorizedError) return
      setError(err instanceof Error ? err.message : 'Could not save the package.')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!pkg) return
    setSaving(true)
    try {
      await deletePackage(tripId, pkg.id)
      removePackage(tripId, pkg.id)
      onSaved?.()
      onClose()
    } catch (err) {
      if (err instanceof UnauthorizedError) return
      setError('Could not delete the package.')
    } finally {
      setSaving(false)
    }
  }

  const tickedCount = ticked
    ? cover.reduce((n, d) => n + d.rows.filter((r) => ticked.has(r.key)).length, 0)
    : 0

  return (
    <Sheet open onClose={onClose} title={editing ? 'Edit package' : 'Add a package'}>
      <div className="pkg-sheet">
        {step === 'details' ? (
          <form
            className="pkg-form"
            aria-label="Package details"
            onSubmit={(e) => {
              e.preventDefault()
              goCovers()
            }}
          >
            <h2 className="pkg-sheet-title">{editing ? 'Edit package' : 'Add a package'}</h2>
            {!editing && (
              <p className="pkg-sheet-intro">
                One price that covers several days, like a tour. It’s counted once in Money, and the
                days it covers show what’s included.
              </p>
            )}
            <label className="pkg-field">
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </label>
            <div className="pkg-row">
              <label className="pkg-field">
                <span>Booked with</span>
                <input
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  maxLength={120}
                />
              </label>
              <label className="pkg-field">
                <span>Total price (EUR)</span>
                <input
                  inputMode="decimal"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  className="pkg-money-input"
                />
              </label>
            </div>
            <div className="pkg-row">
              <label className="pkg-field">
                <span>First day</span>
                <input
                  type="date"
                  value={start}
                  min={tripStart}
                  max={tripEnd}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <label className="pkg-field">
                <span>Last day</span>
                <input
                  type="date"
                  value={end}
                  min={tripStart}
                  max={tripEnd}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
            </div>

            <fieldset className="pkg-fieldset">
              <legend>Payment</legend>
              <div className="seg seg--block" role="group" aria-label="Payment">
                <button
                  type="button"
                  className="seg-btn"
                  aria-pressed={!deposit}
                  onClick={() => setDeposit(false)}
                >
                  Paid in full
                </button>
                <button
                  type="button"
                  className="seg-btn"
                  aria-pressed={deposit}
                  onClick={() => setDeposit(true)}
                >
                  Deposit paid
                </button>
              </div>
              {deposit && (
                <div className="pkg-row">
                  <label className="pkg-field">
                    <span>Paid so far</span>
                    <input
                      inputMode="decimal"
                      value={paid}
                      onChange={(e) => setPaid(e.target.value)}
                    />
                  </label>
                  <label className="pkg-field">
                    <span>Balance due</span>
                    <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
                  </label>
                </div>
              )}
            </fieldset>

            <fieldset className="pkg-fieldset">
              <legend>What’s included</legend>
              <div className="pkg-chips">
                {INCLUDES.map((inc) => {
                  const on = includes.has(inc)
                  return (
                    <button
                      key={inc}
                      type="button"
                      className={on ? 'pkg-chip pkg-chip--on' : 'pkg-chip'}
                      aria-pressed={on}
                      onClick={() =>
                        setIncludes((cur) => {
                          const next = new Set(cur)
                          if (next.has(inc)) next.delete(inc)
                          else next.add(inc)
                          return next
                        })
                      }
                    >
                      {INCLUDE_LABELS[inc]}
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <label className="pkg-field">
              <span>Link</span>
              <input
                type="url"
                value={link}
                placeholder="https://"
                onChange={(e) => setLink(e.target.value)}
              />
            </label>

            {error && (
              <p role="alert" className="fg-error">
                {error}
              </p>
            )}
            <div className="pkg-actions">
              {editing &&
                (confirmDelete ? (
                  <span className="pkg-confirm">
                    Delete it? Its items go back to their own prices.
                    <button
                      type="button"
                      className="fg-btn fg-btn--danger"
                      onClick={() => void remove()}
                      disabled={saving}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      className="fg-btn fg-btn--quiet"
                      onClick={() => setConfirmDelete(false)}
                    >
                      Keep it
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="fg-btn fg-btn--quiet pkg-delete"
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete package
                  </button>
                ))}
              <button type="submit" className="fg-btn fg-btn--primary">
                Next: what it covers
              </button>
            </div>
          </form>
        ) : (
          <div className="pkg-covers">
            <button type="button" className="fg-back pkg-back" onClick={() => setStep('details')}>
              ‹ Details
            </button>
            <h2 className="pkg-sheet-title">What it covers</h2>
            <p className="pkg-sheet-intro">
              Everything already on these days. Ticked items show “Included” instead of a price and
              are never counted twice; a price you give them is an extra on top.
            </p>
            {cover.length === 0 ? (
              <p className="fg-empty">
                Nothing is planned on those days yet. You can link items later.
              </p>
            ) : (
              cover.map((d) => (
                <section key={d.date} className="pkg-cover-day" aria-label={d.label}>
                  <h3 className="pkg-cover-date">{d.label}</h3>
                  <ul className="pkg-cover-list">
                    {d.rows.map((r) => (
                      <li key={r.key}>
                        <label className="pkg-cover-row">
                          <input
                            type="checkbox"
                            checked={ticked?.has(r.key) ?? false}
                            onChange={() =>
                              setTicked((cur) => {
                                const next = new Set(cur ?? [])
                                if (next.has(r.key)) next.delete(r.key)
                                else next.add(r.key)
                                return next
                              })
                            }
                          />
                          <span className="pkg-cover-title">{r.title}</span>
                          <span className={r.kind === 'stay' ? 'tag tag--ok' : 'tag tag--accent'}>
                            {r.tag}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
            {error && (
              <p role="alert" className="fg-error">
                {error}
              </p>
            )}
            <div className="pkg-actions">
              <span className="pkg-count">{tickedCount} linked</span>
              <button
                type="button"
                className="fg-btn fg-btn--primary"
                onClick={() => void save()}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save package'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  )
}
