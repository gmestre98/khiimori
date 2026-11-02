import { describe, expect, it } from 'vitest'
import type { Day, PlanItem, Stay } from '../lib/api'
import { buildDayMetas, countryOf, planSummary, routeSegments, stayRuns } from './tripDays'
import { countryColor } from '../design/countries'

function item(title: string, extra: Partial<PlanItem> = {}): PlanItem {
  return { id: title, trip_id: 't', title, sort_order: 0, status: 'planned', ...extra }
}
function day(date: string, extra: Partial<Day> = {}): Day {
  return { id: date, trip_id: 't', date, index: 0, notes: '', stays: [], plan_items: [], ...extra }
}
function stay(id: string, check_in: string, check_out: string, extra: Partial<Stay> = {}): Stay {
  return { id, trip_id: 't', name: id, check_in, check_out, ...extra }
}

describe('country colours', () => {
  it('uses the named colours for Senegal, The Gambia and Mauritania', () => {
    expect(countryColor('Senegal')).toBe('var(--country-sn)')
    expect(countryColor('The Gambia')).toBe('var(--country-gm)')
    expect(countryColor('mauritania')).toBe('var(--country-mr)')
  })
  it('gives any other country a stable palette slot', () => {
    expect(countryColor('Japan')).toBe(countryColor('japan'))
    expect(countryColor('Japan')).toMatch(/^var\(--country-[1-6]\)$/)
    expect(countryColor('')).toBe('var(--country-none)')
  })
  it('reads the country from the last comma segment only', () => {
    expect(countryOf('Gorée, Dakar, Senegal')).toBe('Senegal')
    expect(countryOf('Dakar')).toBe('')
  })
})

describe('buildDayMetas', () => {
  it('derives place + country per day and carries the country over empty days', () => {
    const days = [
      day('2026-11-18', { plan_items: [item('Ngor', { location: 'Ngor, Dakar, Senegal' })] }),
      day('2026-11-19'),
      day('2026-11-20', { plan_items: [item('Banjul', { location: 'Banjul, The Gambia' })] }),
    ]
    const metas = buildDayMetas(
      days.map((d) => d.date),
      days,
    )
    expect(metas.map((m) => [m.place, m.country, m.hasPlans])).toEqual([
      ['Ngor', 'Senegal', true],
      ['', 'Senegal', false],
      ['Banjul', 'The Gambia', true],
    ])
    expect(routeSegments(metas).map((s) => s.days)).toEqual([2, 1])
  })

  it('uses a custom day title for display but keeps the place', () => {
    const days = [
      day('2026-11-19', {
        title: '  Gorée and the corniche ',
        plan_items: [item('Gorée', { location: 'Gorée, Dakar, Senegal' })],
      }),
      day('2026-11-20', { plan_items: [item('Banjul', { location: 'Banjul, The Gambia' })] }),
    ]
    const metas = buildDayMetas(
      days.map((d) => d.date),
      days,
    )
    expect(metas.map((m) => [m.title, m.place])).toEqual([
      ['Gorée and the corniche', 'Gorée'],
      ['Banjul', 'Banjul'],
    ])
  })

  it('summarises the first plans with "+ N more"', () => {
    const d = day('2026-11-19', {
      plan_items: ['A', 'B', 'C', 'D'].map((t, i) => item(t, { sort_order: i })),
    })
    expect(planSummary(d)).toBe('A, B + 2 more')
  })
})

describe('stayRuns', () => {
  it('lists stays in order with nights, and the nights that have no bed', () => {
    const dates = ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']
    const s1 = stay('Auberge', '2026-11-18', '2026-11-20', { paid: true })
    const days = dates.map((d) => day(d, { stays: d < '2026-11-20' ? [s1] : [] }))
    const runs = stayRuns(dates, days)
    expect(runs.map((r) => [r.kind, r.start, r.nights])).toEqual([
      ['stay', '2026-11-18', 2],
      ['gap', '2026-11-20', 2],
    ])
  })
})
