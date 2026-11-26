import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as api from '../lib/api'
import type { PlanItem } from '../lib/api'
import { QuickAddForm } from './PlanItemForm'
import { placementText } from './placement'

vi.mock('../lib/api', async (orig) => {
  const actual = await orig<typeof import('../lib/api')>()
  return { ...actual, createPlanItem: vi.fn() }
})

function setMobile(mobile: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: mobile && query === '(max-width: 640px)',
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

function created(input: api.PlanItemInput): PlanItem {
  return {
    id: 'new-1',
    trip_id: 'trip-1',
    day_id: 'day-1',
    title: input.title,
    status: 'planned',
    sort_order: 9,
    kind: input.kind,
    start_time: input.start_time ?? undefined,
  } as PlanItem
}

function renderBar(onAdded = vi.fn()) {
  render(
    <QuickAddForm
      tripId="trip-1"
      dayId="day-1"
      onAdded={onAdded}
      variant="bar"
      placeholder="Add a place, ferry, meal or note…"
      titleLabel="Add to Monday"
      sheetHeading="Add to Mon 23 Nov"
      sheetSubmitLabel="Add to day"
      placement={(f) => placementText([{ title: 'Game drive', start_time: '08:00' }], f.start_time)}
    />,
  )
  return onAdded
}

describe('phone add sheet', () => {
  beforeEach(() => {
    setMobile(true)
    vi.mocked(api.createPlanItem).mockReset()
    vi.mocked(api.createPlanItem).mockImplementation(async (_t, input) => created(input))
  })
  afterEach(() => cleanup())

  it('opens from the bar with the name field focused', async () => {
    const user = userEvent.setup()
    renderBar()
    await user.click(screen.getByRole('button', { name: 'Add to Monday' }))
    const sheet = screen.getByRole('dialog', { name: 'Add to Mon 23 Nov' })
    expect(within(sheet).getByLabelText('Name')).toHaveFocus()
    expect(within(sheet).getByRole('button', { name: 'Activity' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('adds with time, status and category, then stays open for the next one', async () => {
    const user = userEvent.setup()
    const onAdded = renderBar()
    await user.click(screen.getByRole('button', { name: 'Add to Monday' }))
    const sheet = screen.getByRole('dialog')
    await user.type(within(sheet).getByLabelText('Name'), 'Sunset pirogue')
    await user.type(within(sheet).getByLabelText('Time'), '17:00')
    expect(within(sheet).getByText('Lands after Game drive (08:00).')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: /^Status/ }))
    await user.click(within(sheet).getByRole('button', { name: 'To book' }))
    await user.click(within(sheet).getByRole('button', { name: 'Add & next' }))

    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1))
    expect(api.createPlanItem).toHaveBeenCalledWith(
      'trip-1',
      expect.objectContaining({
        title: 'Sunset pirogue',
        start_time: '17:00',
        booking_status: 'to_book',
        type: 'Activities',
        kind: 'activity',
        day_id: 'day-1',
      }),
    )
    // Still open, cleared and ready for the next item.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(within(sheet).getByLabelText('Name')).toHaveValue('')
    expect(within(sheet).getByLabelText('Name')).toHaveFocus()
    expect(within(sheet).getByRole('status')).toHaveTextContent('Added “Sunset pirogue”.')
  })

  it('“Add to day” adds and closes the sheet', async () => {
    const user = userEvent.setup()
    const onAdded = renderBar()
    await user.click(screen.getByRole('button', { name: 'Add to Monday' }))
    const sheet = screen.getByRole('dialog')
    await user.type(within(sheet).getByLabelText('Name'), 'Dinner')
    await user.click(within(sheet).getByRole('button', { name: 'Food' }))
    await user.click(within(sheet).getByRole('button', { name: 'Add to day' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(onAdded).toHaveBeenCalledTimes(1)
    expect(api.createPlanItem).toHaveBeenCalledWith(
      'trip-1',
      expect.objectContaining({ title: 'Dinner', kind: 'food', type: 'Food' }),
    )
  })

  it('a note has no time, place or cost rows', async () => {
    const user = userEvent.setup()
    renderBar()
    await user.click(screen.getByRole('button', { name: 'Add to Monday' }))
    const sheet = screen.getByRole('dialog')
    await user.click(within(sheet).getByRole('button', { name: 'Note' }))
    expect(within(sheet).queryByLabelText('Time')).not.toBeInTheDocument()
    expect(within(sheet).queryByLabelText('Cost')).not.toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: /^Where/ })).not.toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: /^Note or link/ })).toBeInTheDocument()
  })

  it('keeps the sheet open and shows the error when adding fails', async () => {
    const user = userEvent.setup()
    vi.mocked(api.createPlanItem).mockRejectedValue(new Error('boom'))
    renderBar()
    await user.click(screen.getByRole('button', { name: 'Add to Monday' }))
    const sheet = screen.getByRole('dialog')
    await user.type(within(sheet).getByLabelText('Name'), 'Ferry')
    await user.click(within(sheet).getByRole('button', { name: 'Add to day' }))
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('Could not add item.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(within(sheet).getByLabelText('Name')).toHaveValue('Ferry')
  })
})

describe('placementText', () => {
  const items = [
    { title: 'Game drive', start_time: '08:00:00' },
    { title: 'Sunset', start_time: '18:00' },
    { title: 'Untimed' },
  ]
  it('names the items around the time', () => {
    expect(placementText(items, '12:00')).toBe(
      'Lands between Game drive (08:00) and Sunset (18:00).',
    )
    expect(placementText(items, '07:00')).toBe('Lands before Game drive (08:00).')
    expect(placementText(items, '19:30')).toBe('Lands after Sunset (18:00).')
  })
  it('says an untimed item goes at the end, and nothing on an empty day', () => {
    expect(placementText(items, '')).toBe('No time: it goes at the end of the day.')
    expect(placementText([], '10:00')).toBeNull()
  })
})
