// Import a trip programme (a tour's day-by-day itinerary) into a trip.
//
// The programme is JSON pasted on the Import screen. Days are numbered from
// the trip's first day (day 1 = trip start) or carry an explicit date, so the
// same programme fits whatever dates the trip has; days outside the trip are
// shown and skipped. Every row gets an id derived from the trip and its place
// in the programme, so importing twice updates instead of duplicating.
//
//   {
//     "title": "Gana, Togo e Benim — 100 Rota",
//     "days": [{ "day": 1, "title": "Accra", "items": [
//       { "title": "Jantar de boas-vindas", "time": "20:00", "kind": "food",
//         "location": "Osu, Accra", "note": "…" }
//     ]}],
//     "stays": [{ "day": 1, "nights": 2, "name": "Hotel em Osu", "location": "Osu, Accra",
//                 "booking_status": "paid" }],
//     "todos": [{ "title": "Visto do Benim (online)", "due": "2026-12-10", "note": "…" }]
//   }

import type { PlanItemInput, PlanItemKind, StayInput, TodoInput } from '../lib/api'
import { normalizeBooking } from './booking'
import { suggestedCategory } from './planItemForm.helpers'

export interface ProgramItem {
  title: string
  time?: string
  duration?: string
  kind?: PlanItemKind
  type?: string
  location?: string
  origin?: string
  destination?: string
  note?: string
  link?: string
  cost?: number
  booking_status?: string
}

export interface ProgramDay {
  day?: number
  date?: string
  title?: string
  items?: ProgramItem[]
}

export interface ProgramStay {
  day?: number
  date?: string
  nights: number
  name: string
  location?: string
  link?: string
  cost?: number
  booking_status?: string
}

export interface ProgramTodo {
  title: string
  due?: string
  note?: string
}

export interface Program {
  title?: string
  days: ProgramDay[]
  stays?: ProgramStay[]
  todos?: ProgramTodo[]
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const KINDS: PlanItemKind[] = ['activity', 'transport', 'food', 'note']

// parseProgram parses and checks pasted JSON, returning the programme or a
// readable list of problems.
export function parseProgram(text: string): { program?: Program; errors: string[] } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { errors: ['That isn’t valid JSON. Copy the whole programme, from { to }.'] }
  }
  const errors: string[] = []
  const p = raw as Program
  if (!p || typeof p !== 'object' || !Array.isArray(p.days)) {
    return { errors: ['The programme needs a "days" list.'] }
  }
  p.days.forEach((d, i) => {
    const at = `Day entry ${i + 1}`
    if (d.date !== undefined && !DATE_RE.test(d.date))
      errors.push(`${at}: date must be YYYY-MM-DD.`)
    if (d.date === undefined && !(Number.isInteger(d.day) && (d.day as number) >= 1)) {
      errors.push(`${at}: give "day" (1, 2, …) or "date".`)
    }
    ;(d.items ?? []).forEach((it, j) => {
      const iat = `${at}, item ${j + 1}`
      if (!it || typeof it.title !== 'string' || !it.title.trim())
        errors.push(`${iat}: needs a title.`)
      if (it?.time !== undefined && !TIME_RE.test(it.time))
        errors.push(`${iat}: time must be HH:MM.`)
      if (it?.kind !== undefined && !KINDS.includes(it.kind)) {
        errors.push(`${iat}: kind must be activity, transport, food or note.`)
      }
    })
  })
  ;(p.stays ?? []).forEach((s, i) => {
    const at = `Stay ${i + 1}`
    if (!s || typeof s.name !== 'string' || !s.name.trim()) errors.push(`${at}: needs a name.`)
    if (!(Number.isInteger(s?.nights) && s.nights >= 1))
      errors.push(`${at}: nights must be 1 or more.`)
    if (s?.date !== undefined && !DATE_RE.test(s.date))
      errors.push(`${at}: date must be YYYY-MM-DD.`)
    if (s?.date === undefined && !(Number.isInteger(s?.day) && (s.day as number) >= 1)) {
      errors.push(`${at}: give "day" or "date" for the first night.`)
    }
  })
  ;(p.todos ?? []).forEach((t, i) => {
    if (!t || typeof t.title !== 'string' || !t.title.trim())
      errors.push(`To-do ${i + 1}: needs a title.`)
    if (t?.due !== undefined && t.due !== '' && !DATE_RE.test(t.due)) {
      errors.push(`To-do ${i + 1}: due must be YYYY-MM-DD.`)
    }
  })
  return errors.length ? { errors } : { program: p, errors: [] }
}

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function dateOf(entry: { day?: number; date?: string }, tripStart: string): string {
  return entry.date ?? addDays(tripStart, (entry.day as number) - 1)
}

export interface PlannedDay {
  key: string
  date: string
  inTrip: boolean
  title: string
  items: PlanItemInput[]
}
export interface PlannedStay {
  key: string
  inTrip: boolean
  input: StayInput
}
export interface ImportPlan {
  days: PlannedDay[]
  stays: PlannedStay[]
  todos: TodoInput[]
}

// planImport maps a programme onto a trip's dates. Ids are filled in later
// (they need hashing); keys say where each row came from.
export function planImport(program: Program, tripStart: string, tripEnd: string): ImportPlan {
  const inRange = (d: string) => d >= tripStart && d <= tripEnd
  const days = program.days.map((d, i) => {
    const date = dateOf(d, tripStart)
    return {
      key: `day-${d.day ?? d.date ?? i}`,
      date,
      inTrip: inRange(date),
      title: (d.title ?? '').trim(),
      items: (d.items ?? []).map((it) => {
        const kind = it.kind ?? 'activity'
        // The API only takes a duration with a start time; without one, keep
        // it in the note instead of failing the whole item.
        const keepDuration = !!it.time && !!it.duration
        const note =
          it.duration && !it.time
            ? [`Duration: ${it.duration}.`, it.note].filter(Boolean).join(' ')
            : it.note
        return {
          title: it.title.trim(),
          kind,
          type: it.type ?? (suggestedCategory(kind) || null),
          start_time: it.time ?? null,
          duration: keepDuration ? it.duration! : null,
          location: kind === 'transport' ? null : (it.location ?? null),
          origin: kind === 'transport' ? (it.origin ?? null) : null,
          destination: kind === 'transport' ? (it.destination ?? null) : null,
          note: note ?? null,
          link: it.link ?? null,
          cost: it.cost ?? null,
          booking_status: kind === 'note' ? null : normalizeBooking(it.booking_status),
        } satisfies PlanItemInput
      }),
    }
  })
  const stays = (program.stays ?? []).map((s, i) => {
    const checkIn = dateOf(s, tripStart)
    const status = normalizeBooking(s.booking_status ?? 'booked')
    return {
      key: `stay-${i}`,
      inTrip: inRange(checkIn),
      input: {
        name: s.name.trim(),
        location: s.location ?? null,
        check_in: checkIn,
        check_out: addDays(checkIn, s.nights),
        cost: s.cost ?? null,
        link: s.link ?? null,
        booking_status: status,
        paid: status === 'paid',
      } satisfies StayInput,
    }
  })
  const todos = (program.todos ?? []).map((t) => ({
    title: t.title.trim(),
    note: t.note ?? '',
    due_date: t.due || null,
  }))
  return { days, stays, todos }
}

// importId is a stable UUID for one row of one trip's import, so re-importing
// upserts the same rows (plan items, stays and to-dos accept client ids).
export async function importId(tripId: string, key: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`khiimori-import:${tripId}:${key}`),
    ),
  ).slice(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4 layout
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // RFC 4122 variant
  const h = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
