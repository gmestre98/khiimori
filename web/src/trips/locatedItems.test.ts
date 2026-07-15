import { describe, expect, it } from 'vitest'
import { buildFeatures, collectLocatedItems, collectLocations, featureList } from './locatedItems'
import type { Day, LatLng, PlanItem, Stay } from '../lib/api'

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

  it('expands a transport leg into origin then destination sharing one feature', () => {
    const day = {
      stays: [],
      plan_items: [
        planItem({
          id: 't1',
          kind: 'transport',
          title: 'Train',
          origin: 'Lisboa',
          destination: 'Porto',
          status: 'done',
          sort_order: 0,
        }),
      ],
    } as Pick<Day, 'stays' | 'plan_items'>

    const items = collectLocatedItems(day)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      id: 't1',
      location: 'Lisboa',
      role: 'from',
      feature: 0,
      done: true,
    })
    expect(items[1]).toMatchObject({
      id: 't1',
      location: 'Porto',
      role: 'to',
      feature: 0,
      done: true,
    })
    // Both endpoints carry the same feature (one number) but distinct React keys.
    expect(items[0].key).not.toBe(items[1].key)
    expect(collectLocations(day)).toEqual(['Lisboa', 'Porto'])
  })

  it('numbers each item once — a leg after a stay is feature 1, not 2', () => {
    const day = {
      stays: [stay({ id: 'hotel', location: 'Lisbon' })],
      plan_items: [
        planItem({
          id: 't1',
          kind: 'transport',
          origin: 'Lisboa',
          destination: 'Porto',
          sort_order: 0,
        }),
        planItem({ id: 'a1', location: 'Porto', sort_order: 1 }),
      ],
    } as Pick<Day, 'stays' | 'plan_items'>

    const features = featureList(collectLocatedItems(day))
    expect(features.map((f) => [f.id, f.number, f.transport])).toEqual([
      ['hotel', 1, false],
      ['t1', 2, true],
      ['a1', 3, false],
    ])
  })

  it('falls back to a single point when a leg has only one end', () => {
    const day = {
      stays: [],
      plan_items: [
        planItem({
          id: 't1',
          kind: 'transport',
          origin: 'Lisboa',
          destination: undefined,
          sort_order: 0,
        }),
      ],
    } as Pick<Day, 'stays' | 'plan_items'>

    const items = collectLocatedItems(day)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 't1', location: 'Lisboa', role: 'point', feature: 0 })
  })

  it('drops a transport leg with neither end located (no feature consumed)', () => {
    const day = {
      stays: [],
      plan_items: [
        planItem({
          id: 't1',
          kind: 'transport',
          origin: undefined,
          destination: undefined,
          sort_order: 0,
        }),
        planItem({ id: 'a1', location: 'Porto', sort_order: 1 }),
      ],
    } as Pick<Day, 'stays' | 'plan_items'>

    const features = featureList(collectLocatedItems(day))
    expect(features).toEqual([
      { id: 'a1', number: 1, label: 'Item', done: false, transport: false },
    ])
  })
})

describe('buildFeatures', () => {
  const lisboa: LatLng = { lat: 38.72, lng: -9.14 }
  const porto: LatLng = { lat: 41.15, lng: -8.61 }

  it('places a leg number at the midpoint of its two ends', () => {
    const day = {
      stays: [],
      plan_items: [
        planItem({
          id: 't1',
          kind: 'transport',
          title: 'Train',
          origin: 'Lisboa',
          destination: 'Porto',
          sort_order: 0,
        }),
      ],
    } as Pick<Day, 'stays' | 'plan_items'>

    const features = buildFeatures(collectLocatedItems(day), [lisboa, porto])
    expect(features).toHaveLength(1)
    const f = features[0]
    expect(f).toMatchObject({ id: 't1', number: 1 })
    expect(f.anchor.lat).toBeCloseTo((lisboa.lat + porto.lat) / 2)
    expect(f.anchor.lng).toBeCloseTo((lisboa.lng + porto.lng) / 2)
    expect(f.ends.map((e) => e.role)).toEqual(['from', 'to'])
  })

  it('renders a plain point as a single ball with no endpoints', () => {
    const day = {
      stays: [],
      plan_items: [planItem({ id: 'a1', location: 'Porto', sort_order: 0 })],
    } as Pick<Day, 'stays' | 'plan_items'>

    const features = buildFeatures(collectLocatedItems(day), [porto])
    expect(features).toHaveLength(1)
    expect(features[0].ends).toEqual([])
    expect(features[0].anchor).toEqual(porto)
  })
})
