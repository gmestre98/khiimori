import { useState } from 'react'
import { Sheet } from '../components/ui'
import {
  available,
  chipText,
  chipTone,
  conflictNote,
  isOn,
  STATUS_OPTIONS,
  toggle,
  type StatusKinds,
  type StatusState,
} from './statusModel'

// StatusOptions is the one status list as toggles: several can be on, and
// turning one on turns off what it conflicts with (see statusModel).
export function StatusOptions({
  state,
  kinds,
  onChange,
  disabled,
  includedIn,
}: {
  state: StatusState
  kinds: StatusKinds
  onChange: (next: StatusState) => void
  disabled?: boolean
  includedIn?: string
}) {
  const [note, setNote] = useState('')
  return (
    <div className="status-options">
      {includedIn && <p className="status-options-included">Booking: included in {includedIn}.</p>}
      <div className="status-options-list" role="group" aria-label="Status">
        {STATUS_OPTIONS.filter((o) => available(o.key, kinds)).map((o) => {
          const on = isOn(state, o.key)
          return (
            <button
              key={o.key}
              type="button"
              className={`status-option status-option--${o.key}`}
              aria-pressed={on}
              disabled={disabled}
              onClick={() => {
                const next = toggle(state, o.key)
                setNote(conflictNote(state, next, o.key))
                onChange(next)
              }}
            >
              <span className="status-option-label">{o.label}</span>
              <span className="status-option-hint">{o.hint}</span>
            </button>
          )
        })}
      </div>
      <p className="status-options-note" aria-live="polite">
        {note}
      </p>
    </div>
  )
}

// StatusChip is the tag on a row: it shows the active statuses and opens the
// status list in a sheet. Changes save as they're tapped.
export function StatusChip({
  label,
  state,
  kinds,
  onChange,
  disabled,
  includedIn,
}: {
  // label names the thing ("Status: Ferry to Barra").
  label: string
  state: StatusState
  kinds: StatusKinds
  onChange: (next: StatusState) => void
  disabled?: boolean
  includedIn?: string
}) {
  const [open, setOpen] = useState(false)
  const tone = chipTone(state, kinds, !!includedIn)
  return (
    <>
      <button
        type="button"
        className={`bk-chip bk-chip--${tone}`}
        aria-label={`Status: ${label}`}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        {chipText(state, kinds, !!includedIn)}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`Status: ${label}`}>
        <div className="status-sheet">
          <h2 className="status-sheet-title">{label}</h2>
          <StatusOptions
            state={state}
            kinds={kinds}
            onChange={onChange}
            disabled={disabled}
            includedIn={includedIn}
          />
          <button
            type="button"
            className="fg-btn fg-btn--primary status-sheet-done"
            onClick={() => setOpen(false)}
          >
            Done
          </button>
        </div>
      </Sheet>
    </>
  )
}
