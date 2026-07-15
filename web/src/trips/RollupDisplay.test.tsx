import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { BudgetSummaryTiles, TripRollup, DayRollup } from './RollupDisplay'
import type { BudgetRollup } from '../lib/api'

function makeRollup(overrides?: Partial<BudgetRollup>): BudgetRollup {
  return {
    trip_total: 0,
    by_category: {},
    by_day: {},
    by_day_category: {},
    estimated_trip_total: 0,
    estimated_by_category: {},
    estimated_by_day: {},
    planned_trip_total: 0,
    planned_by_category: {},
    planned_by_day: {},
    ...overrides,
  }
}

afterEach(() => cleanup())

describe('RollupDisplay upcoming (M12.2)', () => {
  it('shows an upcoming estimate under Spent', () => {
    render(
      <BudgetSummaryTiles
        rollup={makeRollup({ trip_total: 100, estimated_trip_total: 250, planned_trip_total: 500 })}
        dayCount={5}
      />,
    )
    expect(screen.getByText(/upcoming/)).toHaveTextContent('+€250 upcoming')
  })

  it('surfaces a category that is purely upcoming', () => {
    render(
      <TripRollup
        rollup={makeRollup({ estimated_trip_total: 200, estimated_by_category: { Stays: 200 } })}
        dayCount={5}
      />,
    )
    // A category with only an estimate still renders (not filtered out).
    expect(screen.getByText('Stays')).toBeInTheDocument()
    expect(screen.getByText(/upcoming/)).toHaveTextContent('+€200.00 upcoming')
    expect(screen.queryByText('No costs recorded yet.')).not.toBeInTheDocument()
  })

  it('shows a day upcoming line even when nothing is spent that day', () => {
    render(<DayRollup rollup={makeRollup({ estimated_by_day: { 'day-1': 60 } })} dayId="day-1" />)
    expect(screen.getByText(/upcoming/)).toHaveTextContent('+€60.00 upcoming (not yet done)')
  })

  it('tolerates a rollup missing the estimated fields (pre-M12.2 cache)', () => {
    const legacy = {
      trip_total: 40,
      by_category: { Food: 40 },
      by_day: {},
      by_day_category: {},
      planned_trip_total: 0,
      planned_by_category: {},
      planned_by_day: {},
    } as BudgetRollup
    render(<BudgetSummaryTiles rollup={legacy} dayCount={5} />)
    expect(screen.getByText('€40')).toBeInTheDocument()
    expect(screen.queryByText(/upcoming/)).not.toBeInTheDocument()
  })

  it('composes the trip budget from lump + daily allowance × days + day extras', () => {
    // Food lump €50, Stays daily €25/day over 4 days = €100, day extra €40 → €190.
    const rollup = makeRollup({
      planned_by_category: { Food: 50 },
      daily_by_category: { Stays: 25 },
      planned_by_day_category: { 'day-1': { Activities: 40 } },
    })
    render(<BudgetSummaryTiles rollup={rollup} dayCount={4} />)
    // Composed total 50 + 100 + 40 = €190 (shown as Trip budget, and Remaining
    // since nothing is spent).
    expect(screen.getAllByText('€190').length).toBeGreaterThan(0)
  })

  it('shows a day budget from the daily allowance plus that day extra', () => {
    // Stays €25/day allowance + €10 extra on day-1 = €35 budget; €25 spent.
    const rollup = makeRollup({
      by_day: { 'day-1': 25 },
      by_day_category: { 'day-1': { Stays: 25 } },
      daily_by_category: { Stays: 25 },
      planned_by_day_category: { 'day-1': { Stays: 10 } },
    })
    render(<DayRollup rollup={rollup} dayId="day-1" />)
    // The composed €35 day budget shows (day total + the Stays row).
    expect(screen.getAllByText('€35.00').length).toBeGreaterThan(0)
    // And the spend bar reports spent-of-budget for the day total.
    expect(screen.getAllByLabelText(/Spent €25.00 of €35.00/).length).toBeGreaterThan(0)
  })
})
