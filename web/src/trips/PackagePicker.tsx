import { useState } from 'react'
import { updatePackage, UnauthorizedError, type PlanItem } from '../lib/api'
import { packageForItem, upsertPackage, usePackages } from './packages'

// PackagePicker is the plan details sheet's "Included in" control: which
// package (if any) covers this item. Changing it moves the item between
// packages' links. Hidden when the trip has no packages.
export function PackagePicker({ item, date }: { item: PlanItem; date: string }) {
  const packages = usePackages(item.trip_id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!packages || packages.length === 0) return null
  const current = packageForItem(packages, item.id)
  // Packages covering this day first, then the rest.
  const sorted = [...packages].sort((a, b) => {
    const ai = a.start_date <= date && date <= a.end_date ? 0 : 1
    const bi = b.start_date <= date && date <= b.end_date ? 0 : 1
    return ai - bi || a.start_date.localeCompare(b.start_date)
  })

  async function choose(id: string) {
    if (id === (current?.id ?? '')) return
    setBusy(true)
    setError(null)
    try {
      if (current) {
        const saved = await updatePackage(item.trip_id, current.id, {
          plan_item_ids: current.plan_item_ids.filter((x) => x !== item.id),
        })
        upsertPackage(item.trip_id, saved)
      }
      const next = packages!.find((p) => p.id === id)
      if (next) {
        const saved = await updatePackage(item.trip_id, next.id, {
          plan_item_ids: [...next.plan_item_ids.filter((x) => x !== item.id), item.id],
        })
        upsertPackage(item.trip_id, saved)
      }
    } catch (err) {
      if (err instanceof UnauthorizedError) return
      setError('Could not change the package. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={
        current ? 'details-section pkg-picker pkg-picker--on' : 'details-section pkg-picker'
      }
    >
      <label className="details-field-label" htmlFor={`pkg-${item.id}`}>
        Included in
      </label>
      <select
        id={`pkg-${item.id}`}
        className="details-select"
        value={current?.id ?? ''}
        disabled={busy}
        onChange={(e) => void choose(e.target.value)}
      >
        <option value="">Not part of a package</option>
        {sorted.map((p) => (
          <option key={p.id} value={p.id}>
            {p.provider ? `${p.name} · ${p.provider}` : p.name}
          </option>
        ))}
      </select>
      <span className="pkg-picker-hint">
        {current
          ? 'Its cost is part of the package price. A cost you enter below is an extra on top.'
          : 'Pick a package if its price already covers this.'}
      </span>
      {error && (
        <p role="alert" className="fg-error">
          {error}
        </p>
      )}
    </div>
  )
}
