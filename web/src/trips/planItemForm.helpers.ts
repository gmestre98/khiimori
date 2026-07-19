import { useEffect, useState } from 'react'
import type { PlanItem, PlanItemInput, PlanItemKind } from '../lib/api'

// Pure helpers and types shared by the plan-item form and its consumers (the day
// view and the ideas backlog): the field<->wire mappers, the kind metadata, and
// the useMobile viewport hook. Kept free of components so the form file can stay
// fast-refresh clean while both screens import these directly. (M04.5)

// useMobile returns true when the viewport width is ≤ 640 px and tracks
// changes so components re-render on orientation / resize.
export function useMobile(): boolean {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 640px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return mobile
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// PlanItemFormFields holds the raw string values of the optional fields in the
// add/edit form. We use strings throughout so controlled inputs work without
// type coercion; numeric fields are parsed on submit.
export interface PlanItemFormFields {
  title: string
  // kind is carried through the form so edits/auto-saves round-trip it. The
  // backend defaults an omitted kind to 'activity', so NOT sending it would
  // silently downgrade a transport/food/note item on any edit. There is no
  // picker UI yet (that lands in M12.1 S5) — this is a hidden passthrough.
  kind: PlanItemKind
  type: string
  start_time: string
  duration: string
  location: string
  booking_status: string
  cost: string
  link: string
  // Transport columns, carried through as passthrough for the same round-trip
  // reason as kind — editing a transport item must not wipe them. The transport
  // input UI lands in M12.1 S5. (M12.1 S2)
  origin: string
  destination: string
  arrive_time: string
  // note is a free-text context line, most useful on a thing you actually did.
  note: string
}

export function emptyFields(): PlanItemFormFields {
  return {
    title: '',
    kind: 'activity',
    type: '',
    start_time: '',
    duration: '',
    location: '',
    booking_status: '',
    cost: '',
    link: '',
    origin: '',
    destination: '',
    arrive_time: '',
    note: '',
  }
}

// DETAILS_OPEN_KEY persists the "More details" disclosure so the extra fields
// stay open once a user has chosen to see them — no re-clicking on every add.
export const DETAILS_OPEN_KEY = 'khiimori:planDetailsOpen'

// hasDetailValues reports whether any of the fields tucked behind "More details"
// are set. Title and Location live in the always-visible composer, so they're
// excluded. Used to auto-open the disclosure when editing an item that has them.
export function hasDetailValues(f: PlanItemFormFields): boolean {
  return !!(
    f.type ||
    f.start_time ||
    f.duration ||
    f.booking_status ||
    f.cost ||
    f.link ||
    f.origin ||
    f.destination ||
    f.arrive_time ||
    f.note
  )
}

// PLAN_ITEM_KINDS drives the kind picker — a behaviour, not a budget category.
// Each carries a short glyph so the picker reads at a glance. (M12.1 S5)
export const PLAN_ITEM_KINDS: { value: PlanItemKind; label: string; glyph: string }[] = [
  { value: 'activity', label: 'Activity', glyph: '🎟' },
  { value: 'transport', label: 'Transport', glyph: '🚆' },
  { value: 'food', label: 'Food', glyph: '🍴' },
  { value: 'note', label: 'Note', glyph: '📝' },
]

// suggestedCategory maps a kind to its default budget category (the `type`
// field). Cost category is decoupled from kind: this is only the starting
// default, and the user can override it in the Category select. (M12.1 S5)
export function suggestedCategory(kind: PlanItemKind): string {
  switch (kind) {
    case 'transport':
      return 'Transport'
    case 'food':
      return 'Food'
    case 'activity':
      return 'Activities'
    case 'note':
      return ''
  }
}

export function readDetailsOpen(): boolean {
  try {
    return localStorage.getItem(DETAILS_OPEN_KEY) === '1'
  } catch {
    return false
  }
}

export function fieldsFromItem(item: PlanItem): PlanItemFormFields {
  return {
    title: item.title,
    kind: item.kind ?? 'activity',
    type: item.type ?? '',
    start_time: item.start_time ? item.start_time.slice(0, 5) : '',
    duration: item.duration ?? '',
    location: item.location ?? '',
    booking_status: item.booking_status ?? '',
    cost: item.cost != null ? String(item.cost) : '',
    link: item.link ?? '',
    origin: item.origin ?? '',
    destination: item.destination ?? '',
    arrive_time: item.arrive_time ? item.arrive_time.slice(0, 5) : '',
    note: item.note ?? '',
  }
}

// tempPlanItem synthesises a client-side plan item for an offline add so the day
// reflects it immediately. The real row is created server-side when the queued
// mutation replays on reconnect; this temp item carries a fresh client id and a
// large sort_order so it sorts to the end (mirrors FastAddCost's offline entry).
// A page reload after sync then shows the authoritative server item.
export function tempPlanItem(tripId: string, dayId: string | null, input: PlanItemInput): PlanItem {
  return {
    id: input.id ?? crypto.randomUUID(),
    trip_id: tripId,
    day_id: dayId ?? undefined,
    title: input.title,
    kind: input.kind ?? 'activity',
    type: input.type ?? undefined,
    start_time: input.start_time ?? undefined,
    duration: input.duration ?? undefined,
    location: input.location ?? undefined,
    booking_status: input.booking_status ?? undefined,
    cost: input.cost ?? undefined,
    link: input.link ?? undefined,
    origin: input.origin ?? undefined,
    destination: input.destination ?? undefined,
    arrive_time: input.arrive_time ?? undefined,
    note: input.note ?? undefined,
    unplanned: input.unplanned ?? false,
    sort_order: Number.MAX_SAFE_INTEGER,
    // An offline add with no day is a backlog idea; mirror the server so the
    // optimistic row carries the same status the real row will have on sync.
    status: dayId ? 'planned' : 'idea',
  }
}

// mergeInput synthesises the edited plan item for an offline update so the row
// reflects the change immediately (the authoritative server row lands when the
// queued updatePlanItem replays). It reuses tempPlanItem to map the input fields,
// then restores the fields an edit must preserve — the item's status, sort order
// and unplanned flag are not part of the edit form.
export function mergeInput(item: PlanItem, tripId: string, input: PlanItemInput): PlanItem {
  return {
    ...tempPlanItem(tripId, item.day_id ?? null, { ...input, id: item.id }),
    status: item.status,
    sort_order: item.sort_order,
    unplanned: item.unplanned,
  }
}

export function fieldsToInput(
  fields: PlanItemFormFields,
  dayId: string | null | undefined,
): PlanItemInput {
  // Only send fields that belong to the kind. The form keeps hidden values in
  // state (so toggling kind back and forth doesn't lose them), but a note must
  // not silently submit a stale cost into the budget, and a transport leg uses
  // origin/destination + arrival rather than location/duration. (M12.1 S5)
  const isNote = fields.kind === 'note'
  const isTransport = fields.kind === 'transport'
  let cost: number | null = null
  if (!isNote && fields.cost.trim()) cost = parseFloat(fields.cost)
  return {
    title: fields.title.trim(),
    day_id: dayId ?? null,
    kind: fields.kind,
    type: isNote ? null : fields.type.trim() || null,
    start_time: isNote ? null : fields.start_time.trim() || null,
    duration: isNote || isTransport ? null : fields.duration.trim() || null,
    location: isNote || isTransport ? null : fields.location.trim() || null,
    booking_status: isNote ? null : fields.booking_status.trim() || null,
    cost,
    link: fields.link.trim() || null,
    origin: isTransport ? fields.origin.trim() || null : null,
    destination: isTransport ? fields.destination.trim() || null : null,
    arrive_time: isTransport ? fields.arrive_time.trim() || null : null,
    // note is kind-independent — a line of context that survives on any item.
    note: fields.note.trim() || null,
  }
}

// AUTO_SAVE_DEBOUNCE_MS is the delay before a pending edit is flushed to the
// server. Kept short enough to feel instant but long enough to coalesce rapid
// keystrokes into a single write.
export const AUTO_SAVE_DEBOUNCE_MS = 800
