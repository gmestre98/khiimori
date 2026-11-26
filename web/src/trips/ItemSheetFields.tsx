import { useId } from 'react'
import { Icon } from '../components/ui/Icon'
import { BUDGET_CATEGORIES, type PlanItemKind } from '../lib/api'
import { LocationField } from './LocationField'
import { MAX_SPLIT_PARTS } from './splitAmount'
import { PLAN_ITEM_KINDS, suggestedCategory, type PlanItemFormFields } from './planItemForm.helpers'

// ItemSheetFields is the body shared by the phone add sheet and the Plan
// details sheet (design option A): a big name field, a one-row kind switch and
// a card with one short row per detail. Time, duration, cost and category edit
// in place; place and note open under their row. The status row is the
// caller's (adding picks a booking; details uses the full status list).

export type SheetSection = 'where' | 'status' | 'note' | null

export function ItemSheetFields({
  fields,
  onChange,
  open,
  onOpen,
  disabled,
  splitParts,
  onSplitParts,
  statusRow,
  titleLabel,
  titleRef,
  readOnlyTitle,
}: {
  fields: PlanItemFormFields
  onChange: (next: PlanItemFormFields) => void
  open: SheetSection
  onOpen: (section: SheetSection) => void
  disabled?: boolean
  splitParts: number
  onSplitParts: (n: number) => void
  // Rendered where the Status row goes (not for notes).
  statusRow?: React.ReactNode
  titleLabel: string
  titleRef?: React.RefObject<HTMLInputElement | null>
  readOnlyTitle?: boolean
}) {
  const fid = useId()
  const kind = fields.kind
  const cost = parseFloat(fields.cost)

  function set<K extends keyof PlanItemFormFields>(key: K, value: PlanItemFormFields[K]) {
    onChange({ ...fields, [key]: value })
  }

  // changeKind keeps a category the user picked; otherwise it follows the kind.
  function changeKind(next: PlanItemKind) {
    const keepType = fields.type !== '' && fields.type !== suggestedCategory(fields.kind)
    onChange({ ...fields, kind: next, type: keepType ? fields.type : suggestedCategory(next) })
    onOpen(null)
  }

  function toggle(section: Exclude<SheetSection, null>) {
    onOpen(open === section ? null : section)
  }

  const where =
    kind === 'transport'
      ? [fields.origin, fields.destination].filter(Boolean).join(' → ')
      : fields.location
  const noteSummary = [fields.note, fields.link].filter(Boolean).join(' · ')

  return (
    <>
      <input
        ref={titleRef}
        className="add-sheet-title"
        type="text"
        value={fields.title}
        onChange={(e) => set('title', e.target.value)}
        placeholder="Name it…"
        aria-label={titleLabel}
        enterKeyHint="done"
        readOnly={readOnlyTitle}
      />

      <div className="add-sheet-kinds" role="group" aria-label="Kind">
        {PLAN_ITEM_KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            className="add-sheet-kind"
            aria-pressed={kind === k.value}
            onClick={() => changeKind(k.value)}
            disabled={disabled}
          >
            {kind === k.value && <Icon name={k.icon} size={15} />}
            {k.label}
          </button>
        ))}
      </div>

      <div className="add-sheet-rows">
        {kind !== 'note' && (
          <label className="add-sheet-row" htmlFor={`${fid}-time`}>
            <Icon name="clock" size={20} />
            <span className="add-sheet-label">{kind === 'transport' ? 'Departure' : 'Time'}</span>
            <input
              id={`${fid}-time`}
              className="add-sheet-input add-sheet-input--time"
              type="time"
              value={fields.start_time}
              onChange={(e) => set('start_time', e.target.value)}
              disabled={disabled}
            />
          </label>
        )}
        {kind === 'transport' && (
          <label className="add-sheet-row" htmlFor={`${fid}-arrive`}>
            <Icon name="clock" size={20} />
            <span className="add-sheet-label">Arrival</span>
            <input
              id={`${fid}-arrive`}
              className="add-sheet-input add-sheet-input--time"
              type="time"
              value={fields.arrive_time}
              onChange={(e) => set('arrive_time', e.target.value)}
              disabled={disabled}
            />
          </label>
        )}

        {kind !== 'note' && (
          <>
            <button
              type="button"
              className="add-sheet-row"
              aria-expanded={open === 'where'}
              onClick={() => toggle('where')}
            >
              <Icon name="activity" size={20} />
              <span className="add-sheet-label">
                {kind === 'transport' ? 'From → To' : 'Where'}
              </span>
              <span className={where ? 'add-sheet-value' : 'add-sheet-add'}>{where || 'Add'}</span>
            </button>
            {open === 'where' && (
              <div className="add-sheet-panel">
                {kind === 'transport' ? (
                  <>
                    <LocationField
                      label="From"
                      value={fields.origin}
                      onChange={(v) => set('origin', v)}
                      placeholder="e.g. Toubacouta"
                      disabled={disabled}
                    />
                    <LocationField
                      label="To"
                      value={fields.destination}
                      onChange={(v) => set('destination', v)}
                      placeholder="e.g. Joal-Fadiouth"
                      disabled={disabled}
                    />
                  </>
                ) : (
                  <LocationField
                    label="Where"
                    value={fields.location}
                    onChange={(v) => set('location', v)}
                    disabled={disabled}
                  />
                )}
              </div>
            )}
          </>
        )}

        {kind !== 'note' && kind !== 'transport' && (
          <label className="add-sheet-row" htmlFor={`${fid}-dur`}>
            <Icon name="duration" size={20} />
            <span className="add-sheet-label">Duration</span>
            <input
              id={`${fid}-dur`}
              className="add-sheet-input"
              type="text"
              inputMode="numeric"
              value={fields.duration}
              onChange={(e) => set('duration', e.target.value)}
              placeholder="Add"
              disabled={disabled}
            />
          </label>
        )}

        {kind !== 'note' && (
          <>
            <label className="add-sheet-row" htmlFor={`${fid}-cost`}>
              <Icon name="money" size={20} />
              <span className="add-sheet-label">Cost</span>
              <input
                id={`${fid}-cost`}
                className="add-sheet-input"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={fields.cost}
                onChange={(e) => set('cost', e.target.value)}
                placeholder="Add"
                disabled={disabled}
              />
            </label>
            {cost > 0 && (
              <div className="add-sheet-split">
                <label className="add-sheet-split-toggle">
                  <input
                    type="checkbox"
                    checked={splitParts > 1}
                    onChange={(e) => onSplitParts(e.target.checked ? 2 : 1)}
                    disabled={disabled}
                  />
                  Split into several
                </label>
                {splitParts > 1 && (
                  <span className="add-sheet-stepper">
                    <button
                      type="button"
                      aria-label="Fewer parts"
                      onClick={() => onSplitParts(Math.max(2, splitParts - 1))}
                      disabled={disabled || splitParts <= 2}
                    >
                      −
                    </button>
                    <span aria-live="polite">
                      {splitParts} · ≈€{(cost / splitParts).toFixed(2)} each
                    </span>
                    <button
                      type="button"
                      aria-label="More parts"
                      onClick={() => onSplitParts(Math.min(MAX_SPLIT_PARTS, splitParts + 1))}
                      disabled={disabled || splitParts >= MAX_SPLIT_PARTS}
                    >
                      +
                    </button>
                  </span>
                )}
              </div>
            )}

            <label className="add-sheet-row" htmlFor={`${fid}-type`}>
              <Icon name="tag" size={20} />
              <span className="add-sheet-label">Category</span>
              <select
                id={`${fid}-type`}
                className="add-sheet-input add-sheet-select"
                value={fields.type}
                onChange={(e) => set('type', e.target.value)}
                disabled={disabled}
              >
                <option value="">—</option>
                {fields.type && !(BUDGET_CATEGORIES as readonly string[]).includes(fields.type) && (
                  <option value={fields.type}>{fields.type}</option>
                )}
                {BUDGET_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {statusRow}

        <button
          type="button"
          className="add-sheet-row"
          aria-expanded={open === 'note'}
          onClick={() => toggle('note')}
        >
          <Icon name="note" size={20} />
          <span className="add-sheet-label">Note or link</span>
          <span className={noteSummary ? 'add-sheet-value' : 'add-sheet-add'}>
            {noteSummary || 'Add'}
          </span>
        </button>
        {open === 'note' && (
          <div className="add-sheet-panel">
            <label className="add-sheet-field-label" htmlFor={`${fid}-note`}>
              Note
            </label>
            <textarea
              id={`${fid}-note`}
              className="add-sheet-textarea"
              value={fields.note}
              onChange={(e) => set('note', e.target.value)}
              rows={3}
              placeholder="Tips, what to bring, who to ask…"
              disabled={disabled}
            />
            <label className="add-sheet-field-label" htmlFor={`${fid}-link`}>
              Link
            </label>
            <input
              id={`${fid}-link`}
              className="add-sheet-textfield"
              type="url"
              value={fields.link}
              onChange={(e) => set('link', e.target.value)}
              placeholder="https://…"
              disabled={disabled}
            />
          </div>
        )}
      </div>
    </>
  )
}
