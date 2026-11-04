import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { collectLocatedItems, type ItemOrder } from './locatedItems'
import { StaySlot } from './StaySlot'
import {
  UnauthorizedError,
  fetchDay,
  reorderPlanItems,
  reorderPlanItemsActual,
  datesInRange,
  type Day,
  type PlanItem,
  type Stay,
} from '../lib/api'
import { enqueue } from '../lib/mutationQueue'
import { useIsOnline } from '../lib/useIsOnline'
import { readCache, writeCache } from '../lib/resourceCache'
import { cacheKeys } from '../lib/cacheKeys'
import { CacheStatus } from '../components/CacheStatus'
import { Icon, type IconName } from '../components/ui/Icon'
import { DateBox } from '../components/ui/DateBox'
import { DayTitle } from './DayTitle'
import { JournalEditor } from '../journal/JournalEditor'
import { useTripShell } from './useTripShell'
import { QuickAddForm } from './PlanItemForm'
import { PlanItemDetails } from './PlanItemDetails'
import { usePlanItemActions } from './planItemActions'
import { buildDayMetas, countryOf, firstLocation, placeName } from './tripDays'
import { countryColor, NO_COUNTRY_COLOR } from '../design/countries'
import { useMobile } from './planItemForm.helpers'

const DayMap = lazy(() => import('./DayMap'))

// ── Ordering helpers ─────────────────────────────────────────────────────────

// orderTimeline arranges a day's items into the unified timeline (M12.1 S6):
// timed items always read in clock order, while untimed items hold whatever
// position they were dropped into (including between two timed items).
function orderTimeline(items: PlanItem[]): PlanItem[] {
  const timedSorted = items
    .filter((i) => i.start_time != null)
    .slice()
    .sort((a, b) => (a.start_time as string).localeCompare(b.start_time as string))
  let t = 0
  return items.map((i) => (i.start_time != null ? timedSorted[t++] : i))
}

// mergeSubsetOrder repositions the members of `subset` within the full day list
// to the subset's new relative order, leaving every non-member fixed in place.
function mergeSubsetOrder(full: PlanItem[], subset: PlanItem[]): PlanItem[] {
  const ids = new Set(subset.map((i) => i.id))
  let k = 0
  return full.map((item) => (ids.has(item.id) ? subset[k++] : item))
}

// buzz gives a short haptic tick on devices that support it (drag pickup).
function buzz(ms: number) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    // ignore — vibration is a nicety, never required
  }
}

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// kindTag maps an item to its small mono tag (transport legs get a FERRY /
// FLIGHT / TRAIN … word when the title says so).
function kindTag(item: PlanItem): { label: string; tone: string } | null {
  const kind = item.kind ?? 'activity'
  if (kind === 'transport') {
    const t = item.title.toLowerCase()
    const word = /ferry|boat/.test(t)
      ? 'Ferry'
      : /flight|fly|plane/.test(t)
        ? 'Flight'
        : /train/.test(t)
          ? 'Train'
          : /bus/.test(t)
            ? 'Bus'
            : 'Transport'
    return { label: word, tone: 'accent' }
  }
  if (kind === 'food') return { label: 'Food', tone: 'tour' }
  if (kind === 'note') return { label: 'Note', tone: 'night' }
  return null
}

const KIND_ICON: Record<string, IconName> = {
  activity: 'activity',
  transport: 'transport',
  food: 'food',
  note: 'note',
}

// itemWhere is the muted second line under an item: "from → to" for a leg,
// else its location; prefixed with the start time.
function itemWhere(item: PlanItem): string {
  const time = item.start_time ? item.start_time.slice(0, 5) : ''
  const place =
    (item.kind ?? 'activity') === 'transport'
      ? [item.origin, item.destination].filter(Boolean).join(' → ')
      : (item.location ?? '')
  return [time, place].filter(Boolean).join(' · ')
}

function statusWord(status: string): string {
  switch (status) {
    case 'done':
      return 'Done'
    case 'skipped':
      return 'Skipped'
    case 'cancelled':
      return 'Cancelled'
    default:
      return ''
  }
}

// ── Plan rows ────────────────────────────────────────────────────────────────

// PlanRow is one plan item: a round tick that toggles Planned↔Done, the name
// (tap for the details sheet), its time/place line and a kind tag. Transport
// legs render smaller and indented. Untimed rows carry a drag grip.
function PlanRow({
  item,
  draggable: isDraggable,
  isTouchDragging,
  isSelected,
  pinNumber,
  onSelect,
  onToggle,
  toggling,
  onOpen,
  onDragStart,
  onDragOver,
  onDrop,
  onTouchDragStart,
  onTouchDragMove,
  onTouchDragEnd,
}: {
  item: PlanItem
  draggable: boolean
  isTouchDragging: boolean
  isSelected: boolean
  pinNumber?: number
  onSelect?: () => void
  onToggle: () => void
  toggling: boolean
  onOpen: () => void
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, id: string) => void
  onTouchDragStart: (e: React.PointerEvent, id: string) => void
  onTouchDragMove: (e: React.PointerEvent) => void
  onTouchDragEnd: () => void
}) {
  const rowRef = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (isSelected) rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [isSelected])

  const kind = item.kind ?? 'activity'
  const done = item.status === 'done'
  const inactive = item.status === 'skipped' || item.status === 'cancelled'
  const word = statusWord(item.status)
  const tag = kindTag(item)
  const where = itemWhere(item)

  return (
    <li
      ref={rowRef}
      className={[
        'plan-row',
        done ? 'plan-row--done' : '',
        inactive ? 'plan-row--inactive' : '',
        isTouchDragging ? 'plan-row--dragging' : '',
        isSelected ? 'plan-row--selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-item-id={item.id}
      data-kind={kind}
      aria-label={item.title + (word ? ` — ${word}` : '')}
      draggable={isDraggable}
      onDragStart={isDraggable ? (e) => onDragStart(e, item.id) : undefined}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, item.id)}
    >
      {inactive ? (
        <span className="plan-row-inactive-mark" aria-hidden="true">
          <Icon name="close" size={14} />
        </span>
      ) : (
        <button
          type="button"
          className="tick"
          aria-pressed={done}
          aria-label={`${done ? 'Mark not done' : 'Mark done'}: ${item.title}`}
          onClick={onToggle}
          disabled={toggling}
        >
          {done && <Icon name="check" size={14} strokeWidth={3} />}
        </button>
      )}
      <span className="plan-row-body">
        <button
          type="button"
          className="plan-row-title"
          aria-label={`Edit ${item.title}`}
          onClick={onOpen}
        >
          {item.title}
        </button>
        {where && <span className="plan-row-where">{where}</span>}
        {item.note && <span className="plan-row-note">{item.note}</span>}
      </span>
      <span className="plan-row-end">
        {word && item.status !== 'done' && <span className="tag">{word}</span>}
        {tag && (
          <span className={`tag tag--${tag.tone}`}>
            <Icon name={KIND_ICON[kind]} size={11} />
            {tag.label}
          </span>
        )}
        {pinNumber != null && onSelect && (
          <button
            type="button"
            className={[
              'plan-item-pin-badge',
              kind === 'transport' ? 'plan-item-pin-badge--transport' : '',
              isSelected ? 'plan-item-pin-badge--selected' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={`Map pin ${pinNumber} for ${item.title}`}
            aria-pressed={isSelected}
            onClick={onSelect}
          >
            {pinNumber}
          </button>
        )}
        {isDraggable && (
          <button
            type="button"
            className="plan-row-grip"
            aria-label={`Drag to reorder ${item.title}`}
            onPointerDown={(e) => onTouchDragStart(e, item.id)}
            onPointerMove={onTouchDragMove}
            onPointerUp={onTouchDragEnd}
            onPointerCancel={onTouchDragEnd}
          >
            <Icon name="grip" size={16} />
          </button>
        )}
      </span>
    </li>
  )
}

// ReorderableList is an <ol> of PlanRows that can be reordered by dragging: a
// mouse drag on desktop, or a finger drag on the grip on touch. With pinTimed
// only untimed rows can be picked up (timed rows sort by clock); every row is a
// drop target. It reports the new order; persisting is the caller's job.
function ReorderableList({
  items,
  label,
  pinTimed = true,
  selectedId,
  pinNumberForId,
  onSelect,
  onToggle,
  togglingId,
  onOpen,
  onReordered,
}: {
  items: PlanItem[]
  label: string
  pinTimed?: boolean
  selectedId?: string | null
  pinNumberForId?: (id: string) => number | undefined
  onSelect?: (id: string | null) => void
  onToggle: (item: PlanItem) => void
  togglingId: string | null
  onOpen: (item: PlanItem) => void
  onReordered: (order: PlanItem[]) => void
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const [touchOrder, setTouchOrder] = useState<PlanItem[] | null>(null)
  const [touchDragId, setTouchDragId] = useState<string | null>(null)
  const touchDragRef = useRef<string | null>(null)
  const touchOrderRef = useRef<PlanItem[] | null>(null)
  const touchMovedRef = useRef(false)
  const autoScrollRef = useRef<number | null>(null)
  const lastClientYRef = useRef(0)
  const display = touchOrder ?? (pinTimed ? orderTimeline(items) : items)

  useEffect(
    () => () => {
      if (autoScrollRef.current != null) cancelAnimationFrame(autoScrollRef.current)
    },
    [],
  )

  function report(reordered: PlanItem[]) {
    onReordered(pinTimed ? orderTimeline(reordered) : reordered)
  }

  function handleDragStart(e: React.DragEvent, itemId: string) {
    setDraggingId(itemId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', itemId)
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }
  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault()
    const sourceId = e.dataTransfer.getData('text/plain') || draggingId
    setDraggingId(null)
    if (!sourceId || sourceId === targetId) return
    const from = display.findIndex((i) => i.id === sourceId)
    const to = display.findIndex((i) => i.id === targetId)
    if (from === -1 || to === -1) return
    const next = [...display]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    report(next)
  }

  function reflowUnderFinger(clientY: number) {
    const id = touchDragRef.current
    const current = touchOrderRef.current
    const list = listRef.current
    if (!id || !current || !list) return
    let beforeId: string | null = null
    for (const row of list.querySelectorAll<HTMLElement>('[data-item-id]')) {
      const rect = row.getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) {
        beforeId = row.dataset.itemId ?? null
        break
      }
    }
    if (beforeId === id) return
    const order = [...current]
    const from = order.findIndex((i) => i.id === id)
    if (from === -1) return
    const [moved] = order.splice(from, 1)
    let at = beforeId == null ? order.length : order.findIndex((i) => i.id === beforeId)
    if (at === -1) at = order.length
    order.splice(at, 0, moved)
    if (order.every((it, i) => it.id === current[i]?.id)) return
    touchMovedRef.current = true
    touchOrderRef.current = order
    setTouchOrder(order)
    buzz(8)
  }

  function tickAutoScroll() {
    autoScrollRef.current = null
    if (touchDragRef.current == null) return
    const y = lastClientYRef.current
    const band = 72
    const max = 14
    let dy = 0
    if (y < band) dy = -Math.ceil(((band - y) / band) * max)
    else if (y > window.innerHeight - band)
      dy = Math.ceil(((y - (window.innerHeight - band)) / band) * max)
    if (dy !== 0) {
      window.scrollBy(0, dy)
      reflowUnderFinger(y)
    }
    if (touchDragRef.current != null) autoScrollRef.current = requestAnimationFrame(tickAutoScroll)
  }

  function handleTouchDragStart(e: React.PointerEvent, itemId: string) {
    if (e.pointerType === 'mouse') return
    e.preventDefault()
    touchDragRef.current = itemId
    touchOrderRef.current = display
    touchMovedRef.current = false
    lastClientYRef.current = e.clientY
    setTouchDragId(itemId)
    setTouchOrder(display)
    e.currentTarget.setPointerCapture?.(e.pointerId)
    buzz(15)
    autoScrollRef.current = requestAnimationFrame(tickAutoScroll)
  }
  function handleTouchDragMove(e: React.PointerEvent) {
    if (touchDragRef.current == null) return
    e.preventDefault()
    lastClientYRef.current = e.clientY
    reflowUnderFinger(e.clientY)
  }
  function handleTouchDragEnd() {
    const order = touchOrderRef.current
    const moved = touchMovedRef.current
    touchDragRef.current = null
    touchOrderRef.current = null
    touchMovedRef.current = false
    if (autoScrollRef.current != null) {
      cancelAnimationFrame(autoScrollRef.current)
      autoScrollRef.current = null
    }
    setTouchDragId(null)
    setTouchOrder(null)
    if (moved && order) {
      buzz(20)
      report(order)
    }
  }

  return (
    <ol className="plan-list" ref={listRef} aria-label={label}>
      {display.map((item) => (
        <PlanRow
          key={item.id}
          item={item}
          draggable={pinTimed ? item.start_time == null : true}
          isTouchDragging={touchDragId === item.id}
          isSelected={selectedId === item.id}
          pinNumber={pinNumberForId?.(item.id)}
          onSelect={onSelect ? () => onSelect(selectedId === item.id ? null : item.id) : undefined}
          onToggle={() => onToggle(item)}
          toggling={togglingId === item.id}
          onOpen={() => onOpen(item)}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onTouchDragStart={handleTouchDragStart}
          onTouchDragMove={handleTouchDragMove}
          onTouchDragEnd={handleTouchDragEnd}
        />
      ))}
    </ol>
  )
}

// ── Planning (the Plan view) ─────────────────────────────────────────────────

// usePlanState owns the day's item mutations (add/update/remove, reorders) and
// the tick toggle, so the Plan list, the "What happened" log and the details
// sheet all share one source of truth.
function usePlanState({
  day,
  items,
  setItems,
  tripId,
}: {
  day: Day
  items: PlanItem[]
  setItems: React.Dispatch<React.SetStateAction<PlanItem[]>>
  tripId: string
}) {
  const online = useIsOnline()
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)

  const handleAdded = useCallback((item: PlanItem) => setItems((p) => [...p, item]), [setItems])
  const handleUpdated = useCallback(
    (u: PlanItem) => setItems((p) => p.map((i) => (i.id === u.id ? u : i))),
    [setItems],
  )
  const handleRemoved = useCallback(
    (id: string) => setItems((p) => p.filter((i) => i.id !== id)),
    [setItems],
  )
  const actions = usePlanItemActions({
    tripId,
    onUpdated: handleUpdated,
    onRemoved: handleRemoved,
    onAdded: handleAdded,
  })

  async function toggleDone(item: PlanItem) {
    setTogglingId(item.id)
    setToggleError(null)
    try {
      await actions.setStatus(item, item.status === 'done' ? 'planned' : 'done')
    } catch {
      setToggleError(`Could not update “${item.title}”.`)
    } finally {
      setTogglingId(null)
    }
  }

  // persistReorder stamps sort_order 0,1,2,… onto the full day order (so pin
  // numbers update at once), updates optimistically and saves the sequence.
  function persistReorder(fullOrder: PlanItem[]) {
    const renumbered = fullOrder.map((item, idx) =>
      item.sort_order === idx ? item : { ...item, sort_order: idx },
    )
    const snapshot = items
    setItems(renumbered)
    const itemIds = renumbered.map((i) => i.id)
    if (!online) {
      void enqueue('reorderPlanItems', { tripId, dayId: day.id, itemIds })
      return
    }
    reorderPlanItems(tripId, day.id, itemIds).catch(() => setItems(snapshot))
  }

  function handlePlanReordered(newPlanOrder: PlanItem[]) {
    const ordered = [...items].sort((a, b) => a.sort_order - b.sort_order)
    persistReorder(mergeSubsetOrder(ordered, newPlanOrder))
  }

  // The "What happened" order is its own sequence (actual_order) — reordering
  // it never touches the plan's sort_order.
  function handleDoneReordered(newDoneOrder: PlanItem[]) {
    const orderById = new Map(newDoneOrder.map((it, idx) => [it.id, idx]))
    const snapshot = items
    setItems(
      items.map((it) => {
        const idx = orderById.get(it.id)
        return idx == null || it.actual_order === idx ? it : { ...it, actual_order: idx }
      }),
    )
    const itemIds = newDoneOrder.map((i) => i.id)
    if (!online) {
      void enqueue('reorderPlanItemsActual', { tripId, dayId: day.id, itemIds })
      return
    }
    reorderPlanItemsActual(tripId, day.id, itemIds).catch(() => setItems(snapshot))
  }

  // Plan = everything except things logged after the fact. What happened =
  // done items + logged ones, in their own actual order.
  const planItems = items.filter((i) => !i.unplanned)
  const doneItems = items
    .filter((i) => i.status === 'done' || i.unplanned)
    .sort((a, b) => (a.actual_order ?? a.sort_order) - (b.actual_order ?? b.sort_order))

  return {
    planItems,
    doneItems,
    togglingId,
    toggleError,
    toggleDone,
    handleAdded,
    handleUpdated,
    handleRemoved,
    handlePlanReordered,
    handleDoneReordered,
  }
}

type PlanState = ReturnType<typeof usePlanState>

// PlanPanel is the Plan view: progress line, the tick list and the add bar.
function PlanPanel({
  day,
  tripId,
  plan,
  weekday,
  selectedId,
  pinNumberForId,
  onSelect,
  onOpen,
  heading,
  showAddBar = true,
}: {
  day: Day
  tripId: string
  plan: PlanState
  weekday: string
  selectedId: string | null
  pinNumberForId?: (id: string) => number | undefined
  onSelect?: (id: string | null) => void
  onOpen: (item: PlanItem) => void
  heading?: React.ReactNode
  // showAddBar: the desktop card hosts the add bar inline; on phones DayView
  // pins it to the bottom of the whole day column instead.
  showAddBar?: boolean
}) {
  const { planItems } = plan
  const doneCount = planItems.filter((i) => i.status === 'done').length
  return (
    <section className="day-plan" aria-label="Planning" data-slot="planning">
      {heading}
      {planItems.length > 0 ? (
        <>
          <p className="day-plan-progress">
            <span>
              {doneCount} of {planItems.length} done
            </span>
            <span className="day-plan-hint">Tap ○ to tick off · tap a name for details</span>
          </p>
          <ReorderableList
            items={planItems}
            label="Day timeline"
            selectedId={selectedId}
            pinNumberForId={pinNumberForId}
            onSelect={onSelect}
            onToggle={(i) => void plan.toggleDone(i)}
            togglingId={plan.togglingId}
            onOpen={onOpen}
            onReordered={plan.handlePlanReordered}
          />
        </>
      ) : (
        <p className="day-plan-empty">Nothing planned yet.</p>
      )}
      {plan.toggleError && (
        <p role="alert" className="fg-error">
          {plan.toggleError}
        </p>
      )}
      {showAddBar && <DayAddBar day={day} tripId={tripId} plan={plan} weekday={weekday} />}
    </section>
  )
}

// DayAddBar is the single "Add a place, ferry, meal or note…" bar. Its kind
// chips, place and details appear once it's focused (PlanItemForm bar variant).
function DayAddBar({
  day,
  tripId,
  plan,
  weekday,
}: {
  day: Day
  tripId: string
  plan: PlanState
  weekday: string
}) {
  return (
    <QuickAddForm
      tripId={tripId}
      dayId={day.id}
      onAdded={plan.handleAdded}
      variant="bar"
      placeholder="Add a place, ferry, meal or note…"
      titleLabel={`Add to ${weekday}`}
    />
  )
}

// JournalPanel is the Journal view: photos + diary (JournalEditor) and "What
// happened" — the ticked-off plans plus anything logged after the fact, in the
// order it actually happened.
function JournalPanel({
  day,
  tripId,
  plan,
  onOpen,
}: {
  day: Day
  tripId: string
  plan: PlanState
  onOpen: (item: PlanItem) => void
}) {
  return (
    <section className="day-journal" aria-label="Journal" data-slot="journal">
      <JournalEditor tripId={tripId} dayId={day.id} readOnly={false} photosFirst />
      <div className="day-happened">
        <h3 className="fg-label">What happened</h3>
        {plan.doneItems.length === 0 ? (
          <p className="day-plan-empty">
            Nothing ticked off yet. Whatever you tick off in the plan shows up here, so the day
            writes its own log.
          </p>
        ) : (
          <ReorderableList
            items={plan.doneItems}
            label="What happened"
            pinTimed={false}
            onToggle={(i) => void plan.toggleDone(i)}
            togglingId={plan.togglingId}
            onOpen={onOpen}
            onReordered={plan.handleDoneReordered}
          />
        )}
        <QuickAddForm tripId={tripId} dayId={day.id} onAdded={plan.handleAdded} logDone />
      </div>
    </section>
  )
}

// MapSlot lazily renders the per-day map (lazy + Suspense) so the map bundle
// is only fetched when a day is open on a wide screen.
function MapSlot({
  day,
  selectedId,
  onSelect,
}: {
  day: Day | null
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  return (
    <section className="day-rail-card day-slot-map" aria-label="Map" data-slot="map">
      <h2 className="fg-label">Map</h2>
      {day ? (
        <Suspense
          fallback={
            <p className="day-map-loading" aria-busy="true">
              Loading map…
            </p>
          }
        >
          <DayMap key={day.id} day={day} selectedId={selectedId} onSelect={onSelect} />
        </Suspense>
      ) : null}
    </section>
  )
}

// DayVariant: the same day screen serves the Days tab (the plan) and the
// Journal tab (photos, diary and what happened). Each tab owns one; there is
// no Plan / Journal switch and no budget block on the day — money lives in
// the Money tab only.
export type DayVariant = 'plan' | 'journal'

// useIsWide is true at the desktop layout (≥1024px), where the day shows its
// plan with a right rail (stay, journal, money, map) instead of the phone's
// Plan / Journal switch.
function useIsWide(): boolean {
  const [wide, setWide] = useState(() =>
    typeof window === 'undefined' ? true : window.innerWidth >= 1024,
  )
  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 1024)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return wide
}

// DayView renders a single trip day (/trips/:tripId/days/:date): date box +
// country + place, a compact stay line, then (variant 'plan') the tick-to-done
// plan with a pinned add bar, or (variant 'journal') photos, diary and what
// happened. Legacy note from the switch era:
// (tick-to-done plan with a pinned add bar · photos, diary and what happened),
// and on desktop the plan beside a rail with the stay, journal, money and map.
// Tapping an item's name opens the Plan details sheet.
export function DayView({ variant = 'plan' }: { variant?: DayVariant } = {}) {
  const { tripId, date } = useParams<{ tripId: string; date: string }>()
  const { trip, tripDays } = useTripShell()
  const wide = useIsWide()
  const mobile = useMobile()
  const journal = variant === 'journal'
  const section = journal ? 'journal' : 'days'

  const [day, setDay] = useState<Day | null>(null)
  const [planItems, setPlanItems] = useState<PlanItem[]>([])
  const [fetchError, setFetchError] = useState<{ date: string; msg: string } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openItemId, setOpenItemId] = useState<string | null>(null)
  const [seededFromCache, setSeededFromCache] = useState(false)
  const [revalidating, setRevalidating] = useState(false)

  const loading = day?.date !== date && fetchError?.date !== date
  const error = fetchError !== null && fetchError.date === date ? fetchError.msg : null

  useEffect(() => {
    if (!tripId || !date) return
    const controller = new AbortController()
    let done = false
    const key = cacheKeys.day(tripId, date)
    void readCache<Day>(key).then((cached) => {
      if (done) return
      const hasCache = cached !== null && cached.data.date === date
      if (hasCache) {
        setDay(cached.data)
        setPlanItems(cached.data.plan_items)
        setSeededFromCache(true)
      }
      setRevalidating(true)
      return fetchDay(tripId, date, controller.signal).then(
        (d) => {
          if (done) return
          setDay(d)
          setPlanItems(d.plan_items)
          setSeededFromCache(false)
          setRevalidating(false)
          void writeCache(key, d)
        },
        (err: unknown) => {
          if (done) return
          setRevalidating(false)
          if (err instanceof DOMException && err.name === 'AbortError') return
          if (err instanceof UnauthorizedError) return
          if (!hasCache) setFetchError({ date, msg: 'Could not load day.' })
        },
      )
    })
    return () => {
      done = true
      controller.abort()
    }
  }, [tripId, date])

  const liveDay = day ? { ...day, plan_items: planItems } : null

  // Persist every optimistic mutation to the on-device cache so an offline
  // reload keeps showing it (and the trip's Days list re-syncs from it).
  useEffect(() => {
    if (!tripId || !day || day.date !== date) return
    const live = { ...day, plan_items: planItems }
    void writeCache(cacheKeys.day(tripId, date), live)
    tripDays?.replaceDay(live)
    // tripDays.replaceDay is a fresh closure each render; the data deps suffice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, date, day, planItems])

  const setStays: React.Dispatch<React.SetStateAction<Stay[]>> = (action) => {
    setDay((cur) =>
      cur
        ? {
            ...cur,
            stays:
              typeof action === 'function'
                ? (action as (prev: Stay[]) => Stay[])(cur.stays)
                : action,
          }
        : cur,
    )
  }

  const dates = datesInRange(trip.start_date, trip.end_date)
  const dayIndex = date ? dates.indexOf(date) : -1
  const prevDate = dayIndex > 0 ? dates[dayIndex - 1] : null
  const nextDate = dayIndex >= 0 && dayIndex < dates.length - 1 ? dates[dayIndex + 1] : null

  // Place + country: this day's own stay / first location, else the run the
  // trip's day list worked out (a day with no places keeps the previous one's).
  const metas = tripDays?.days ? buildDayMetas(tripDays.dates, tripDays.days) : null
  const meta = metas && dayIndex >= 0 ? metas[dayIndex] : null
  const loc = liveDay ? firstLocation(liveDay) : ''
  const country = (loc ? countryOf(loc) : '') || (meta?.country ?? '')
  const color = country ? countryColor(country) : (meta?.color ?? NO_COUNTRY_COLOR)
  const place = placeName(loc) || meta?.place || `Day ${dayIndex + 1}`
  const weekday = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })
    : 'this day'
  const dayLong = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : ''
  const hasPlans = planItems.some((i) => !i.unplanned)

  // Map pin numbers — only when the map is on screen (desktop rail).
  const mapOrder: ItemOrder = date && date < localToday() ? 'actual' : 'plan'
  const located = liveDay ? collectLocatedItems(liveDay, mapOrder) : []
  const pinNumberForId = wide
    ? (id: string): number | undefined => {
        const li = located.find((it) => it.id === id)
        return li ? li.feature + 1 : undefined
      }
    : undefined

  const state = usePlanState({
    day: liveDay ?? ({ id: '', plan_items: [] } as unknown as Day),
    items: planItems,
    setItems: setPlanItems,
    tripId: tripId ?? '',
  })
  const openItem = openItemId ? (planItems.find((i) => i.id === openItemId) ?? null) : null

  const navLink = (target: string | null, dir: 'prev' | 'next') => {
    const label = dir === 'prev' ? 'Previous day' : 'Next day'
    if (!target) {
      return (
        <span className="fg-icon-btn" aria-disabled="true" aria-label={label}>
          <Icon name={dir === 'prev' ? 'chevron-left' : 'chevron-right'} size={20} />
        </span>
      )
    }
    const d = new Date(target + 'T00:00:00').toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    })
    return (
      <Link
        to={`/trips/${trip.id}/${section}/${target}`}
        state={{ trip }}
        className="fg-icon-btn"
        aria-label={`${label}, ${d}`}
      >
        <Icon name={dir === 'prev' ? 'chevron-left' : 'chevron-right'} size={20} />
      </Link>
    )
  }

  const header = (
    <>
      <div className="day-topbar">
        <Link
          to={`/trips/${trip.id}/${journal ? 'journal' : 'plan'}`}
          state={{ trip }}
          className="fg-back day-topbar-back"
        >
          <Icon name="back" size={18} />
          {journal ? 'Journal' : 'All days'}
        </Link>
        <nav className="day-topbar-nav" aria-label="Day navigation">
          {navLink(prevDate, 'prev')}
          <span className="fg-meta">
            Day {dayIndex + 1} / {dates.length}
          </span>
          {navLink(nextDate, 'next')}
        </nav>
      </div>
      {date && (
        <header className="day-title">
          <DateBox date={date} color={color} size="lg" empty={!hasPlans} showMonth />
          <span
            className="day-title-country fg-label"
            style={{ color: country ? `color-mix(in srgb, ${color} 72%, var(--ink))` : undefined }}
          >
            {wide ? `Day ${dayIndex + 1}${country ? ` · ${country}` : ''}` : country || dayLong}
          </span>
          <DayTitle
            tripId={trip.id}
            date={date}
            title={day?.date === date ? (day.title ?? '').trim() : ''}
            place={place}
            onSaved={(t) => setDay((cur) => (cur ? { ...cur, title: t } : cur))}
          >
            <CacheStatus fromCache={seededFromCache} isValidating={revalidating} />
          </DayTitle>
        </header>
      )}
    </>
  )

  const staySlot =
    liveDay && tripId ? (
      <StaySlot
        day={liveDay}
        tripId={tripId}
        setStays={setStays}
        selectedId={selectedId}
        pinNumberForId={pinNumberForId}
        onSelect={wide ? setSelectedId : undefined}
      />
    ) : null

  const planPanel =
    liveDay && tripId ? (
      <PlanPanel
        day={liveDay}
        tripId={tripId}
        plan={state}
        weekday={weekday}
        selectedId={selectedId}
        pinNumberForId={pinNumberForId}
        onSelect={wide ? setSelectedId : undefined}
        onOpen={(i) => setOpenItemId(i.id)}
        showAddBar={wide}
      />
    ) : null

  const journalPanel =
    liveDay && tripId ? (
      <JournalPanel
        day={liveDay}
        tripId={tripId}
        plan={state}
        onOpen={(i) => setOpenItemId(i.id)}
      />
    ) : null

  return (
    <article
      className={wide ? 'day-view day-view--wide' : 'day-view'}
      aria-label={date ? `Day ${dayIndex + 1} — ${date}` : 'Day'}
    >
      {loading && (
        <p className="fg-loading day-view-loading" aria-busy="true">
          Loading day…
        </p>
      )}
      {error && (
        <p role="alert" className="fg-error day-view-error">
          {error}
        </p>
      )}

      {journal ? (
        <div className={wide ? 'day-journal-page day-journal-page--wide' : 'day-journal-page'}>
          {header}
          {journalPanel}
        </div>
      ) : wide ? (
        <div className="day-desk">
          <div className="day-desk-main fg-card">
            {header}
            {day?.notes && <p className="day-view-notes">{day.notes}</p>}
            {planPanel}
          </div>
          <aside className="day-desk-rail" aria-label="About this day">
            {staySlot}
            <MapSlot day={liveDay} selectedId={selectedId} onSelect={setSelectedId} />
          </aside>
        </div>
      ) : (
        <div className="day-phone">
          {header}
          {staySlot}
          {day?.notes && <p className="day-view-notes">{day.notes}</p>}
          {planPanel}
          {!mobile && <MapSlot day={liveDay} selectedId={selectedId} onSelect={setSelectedId} />}
          <Link
            to={`/trips/${trip.id}/map?day=${date}`}
            state={{ trip }}
            className="fg-link-card day-map-link"
          >
            <span className="fg-link-card-title">See this day on the map</span>
            <Icon name="chevron-right" size={16} />
          </Link>
          {liveDay && tripId && (
            <DayAddBar day={liveDay} tripId={tripId} plan={state} weekday={weekday} />
          )}
        </div>
      )}

      {openItem && tripId && date && (
        <PlanItemDetails
          item={openItem}
          tripId={tripId}
          dayLabel={`${dayLong}${place ? ` · ${place}` : ''}`}
          tripDates={dates}
          currentDate={date}
          onClose={() => setOpenItemId(null)}
          onUpdated={state.handleUpdated}
          onRemoved={(id) => {
            state.handleRemoved(id)
            setOpenItemId(null)
          }}
          onAdded={state.handleAdded}
        />
      )}
    </article>
  )
}
