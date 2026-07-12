import { describe, expect, it } from 'vitest'
import { collectLocatedItems } from './locatedItems'
import type { Day, PlanItem, Stay } from '../lib/api'

function planItem(over: Partial<PlanItem>): PlanItem {
  return {
    id: 'i',
    trip_id: 't',
    title: 'Item',
    sort_order: 0,
    status: 'planned',
    ...over,
  }
}

function stay(over: Partial<Stay>): Stay {
  return {
    id: 's',
    trip_id: 't',
    name: 'Hotel',
    check_in: '2026-06-01',
    check_out: '2026-06-02',
    paid: false,
    ...over,
  }
}

describe('collectLocatedItems', () => {
  it('marks a done plan item as done and a non-done one as not', () => {
    const day = {
      stays: [],
      plan_items: [
        planItem({ id: 'done', location: 'Belém', status: 'done', sort_order: 0 }),
        planItem({ id: 'planned', location: 'Sintra', status: 'planned', sort_order: 1 }),
      ],
    } as Pick<Day, 'stays' | 'plan_items'>

    const items = collectLocatedItems(day)
    expect(items.find((i) => i.id === 'done')?.done).toBe(true)
    expect(items.find((i) => i.id === 'planned')?.done).toBe(false)
  })

  it('treats a stay as done (you slept there) and drops location-less items', () => {
    const day = {
      stays: [
        stay({ id: 'hotel', location: 'Lisbon' }),
        stay({ id: 'no-loc', location: undefined }),
      ],
      plan_items: [planItem({ id: 'no-loc-item', location: undefined, status: 'done' })],
    } as Pick<Day, 'stays' | 'plan_items'>

    const items = collectLocatedItems(day)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 'hotel', done: true })
  })
})
