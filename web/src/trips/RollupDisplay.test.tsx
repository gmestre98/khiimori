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
      />,
    )
    expect(screen.getByText(/upcoming/)).toHaveTextContent('+€250 upcoming')
  })

  it('surfaces a category that is purely upcoming', () => {
    render(
      <TripRollup
        rollup={makeRollup({ estimated_trip_total: 200, estimated_by_category: { Stays: 200 } })}
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
    render(<BudgetSummaryTiles rollup={legacy} />)
    expect(screen.getByText('€40')).toBeInTheDocument()
    expect(screen.queryByText(/upcoming/)).not.toBeInTheDocument()
  })
})
