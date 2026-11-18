import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  createPlanItem,
  createStay,
  createTodo,
  fetchDay,
  setDayTitle,
  StayOverlapError,
  UnauthorizedError,
} from '../lib/api'
import { importId, parseProgram, planImport, type ImportPlan } from './importProgram'
import { useTripShell } from './useTripShell'

function shortDate(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

type Phase =
  | { kind: 'edit' }
  | { kind: 'running'; done: number; total: number }
  | { kind: 'done'; added: number; problems: string[] }

// ImportProgramPage adds a pasted programme (a tour's day-by-day itinerary) to
// the trip: day titles, plan items, stays and to-dos. Day 1 is the trip's
// first day; days outside the trip are listed and skipped. Importing again
// updates the same rows instead of adding copies.
export default function ImportProgramPage() {
  const { trip, tripDays } = useTripShell()
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<Phase>({ kind: 'edit' })

  const parsed = useMemo(() => (text.trim() ? parseProgram(text) : null), [text])
  const plan: ImportPlan | null = useMemo(
    () => (parsed?.program ? planImport(parsed.program, trip.start_date, trip.end_date) : null),
    [parsed, trip.start_date, trip.end_date],
  )
  const inDays = plan?.days.filter((d) => d.inTrip) ?? []
  const outDays = plan?.days.filter((d) => !d.inTrip) ?? []
  const inStays = plan?.stays.filter((s) => s.inTrip) ?? []
  const itemCount = inDays.reduce((n, d) => n + d.items.length, 0)

  async function run() {
    if (!plan) return
    const steps: { label: string; go: () => Promise<void> }[] = []
    const problems: string[] = []
    for (const d of inDays) {
      if (d.title) {
        steps.push({
          label: `title for ${d.date}`,
          go: () => setDayTitle(trip.id, d.date, d.title).then(() => {}),
        })
      }
      d.items.forEach((item, i) => {
        steps.push({
          label: `“${item.title}”`,
          go: async () => {
            const day = await fetchDay(trip.id, d.date)
            const id = await importId(trip.id, `${d.key}-item-${i}`)
            await createPlanItem(trip.id, { ...item, id, day_id: day.id })
          },
        })
      })
    }
    for (const s of inStays) {
      steps.push({
        label: `stay “${s.input.name}”`,
        go: async () => {
          const id = await importId(trip.id, s.key)
          try {
            await createStay(trip.id, { ...s.input, id })
          } catch (err) {
            if (err instanceof StayOverlapError) {
              problems.push(
                `Stay “${s.input.name}” (${s.input.check_in} → ${s.input.check_out}) overlaps a stay you already have, so it was skipped.`,
              )
              return
            }
            throw err
          }
        },
      })
    }
    plan.todos.forEach((t, i) => {
      steps.push({
        label: `to-do “${t.title}”`,
        go: async () => {
          const id = await importId(trip.id, `todo-${i}`)
          await createTodo(trip.id, { ...t, id })
        },
      })
    })

    let added = 0
    setPhase({ kind: 'running', done: 0, total: steps.length })
    for (const [i, step] of steps.entries()) {
      try {
        await step.go()
        added++
      } catch (err) {
        if (err instanceof UnauthorizedError) return
        problems.push(
          `Couldn’t add ${step.label}: ${err instanceof Error ? err.message : 'error'}.`,
        )
      }
      setPhase({ kind: 'running', done: i + 1, total: steps.length })
    }
    // Show the new days straight away in the trip's screens.
    if (tripDays) {
      const dates = new Set([
        ...inDays.map((d) => d.date),
        ...inStays.flatMap((s) => {
          const out: string[] = []
          for (let d = s.input.check_in!; d < s.input.check_out!; ) {
            out.push(d)
            const n = new Date(d + 'T00:00:00Z')
            n.setUTCDate(n.getUTCDate() + 1)
            d = n.toISOString().slice(0, 10)
          }
          return out
        }),
      ])
      await Promise.all(
        [...dates].map((d) =>
          fetchDay(trip.id, d)
            .then((day) => tripDays.replaceDay(day))
            .catch(() => {}),
        ),
      )
    }
    setPhase({ kind: 'done', added, problems })
  }

  return (
    <section className="import-page" aria-labelledby="import-title">
      <h1 id="import-title" className="fg-title">
        Import a programme
      </h1>
      <p className="import-intro">
        Paste a tour’s day-by-day programme. Day 1 goes on {shortDate(trip.start_date)}, the trip’s
        first day. You’ll see where everything lands before anything is added, and importing again
        updates instead of adding copies.
      </p>

      {phase.kind === 'done' ? (
        <div className="import-result" role="status">
          <p>
            <b>Done.</b> Added or updated {phase.added} {phase.added === 1 ? 'thing' : 'things'}.
          </p>
          {phase.problems.length > 0 && (
            <ul className="import-problems">
              {phase.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <Link className="fg-btn fg-btn--primary" to={`/trips/${trip.id}/plan`}>
            See the days
          </Link>
        </div>
      ) : (
        <>
          <label className="import-field">
            <span>Programme (JSON)</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              spellCheck={false}
              placeholder='{ "days": [ { "day": 1, "title": "…", "items": [ … ] } ] }'
              disabled={phase.kind === 'running'}
            />
          </label>

          {parsed && parsed.errors.length > 0 && (
            <ul role="alert" className="import-problems">
              {parsed.errors.slice(0, 8).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          {plan && (
            <div className="import-preview">
              <p className="import-summary">
                {inDays.length} {inDays.length === 1 ? 'day' : 'days'} · {itemCount} plan items ·{' '}
                {inStays.length} stays · {plan.todos.length} to-dos
                {parsed?.program?.title ? ` — ${parsed.program.title}` : ''}
              </p>
              <ol className="import-days">
                {plan.days.map((d) => (
                  <li key={d.key} className={d.inTrip ? '' : 'import-day--out'}>
                    <span className="import-day-date">{shortDate(d.date)}</span>
                    <span className="import-day-title">
                      {d.title || 'Untitled day'}
                      <small>
                        {d.inTrip
                          ? `${d.items.length} ${d.items.length === 1 ? 'item' : 'items'}`
                          : 'Outside your trip dates — skipped'}
                      </small>
                    </span>
                  </li>
                ))}
              </ol>
              {outDays.length > 0 && (
                <p className="import-note">
                  {outDays.length} {outDays.length === 1 ? 'day falls' : 'days fall'} outside{' '}
                  {shortDate(trip.start_date)} – {shortDate(trip.end_date)}. Change the trip’s dates
                  first if you want {outDays.length === 1 ? 'it' : 'them'} too.
                </p>
              )}
              {plan.stays.some((s) => !s.inTrip) && (
                <p className="import-note">Stays starting outside the trip dates are skipped.</p>
              )}
              <button
                type="button"
                className="fg-btn fg-btn--primary"
                disabled={phase.kind === 'running'}
                onClick={() => void run()}
              >
                {phase.kind === 'running'
                  ? `Importing… ${phase.done} of ${phase.total}`
                  : 'Import into this trip'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
