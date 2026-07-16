import { describe, expect, it } from 'vitest'
import type { BudgetRollup } from '../lib/api'
import {
  dayBudgetForCategory,
  dayBudgetTotal,
  patchRollupPlanned,
  tripBudgetForCategory,
  tripBudgetTotal,
} from './budgetModel'
import type { BudgetLine } from '../lib/api'

function rollup(over?: Partial<BudgetRollup>): BudgetRollup {
  return {
    trip_total: 0,
    by_category: {},
    by_day: {},
    by_day_category: {},
    planned_trip_total: 0,
    planned_by_category: {},
    planned_by_day: {},
    ...over,
  }
}

describe('budgetModel', () => {
  it('day budget = daily allowance + that day extra', () => {
    const r = rollup({
      daily_by_category: { Stays: 25, Food: 30 },
      planned_by_day_category: { 'day-1': { Food: 10 } },
    })
    expect(dayBudgetForCategory(r, 'day-1', 'Stays')).toBe(25)
    expect(dayBudgetForCategory(r, 'day-1', 'Food')).toBe(40) // 30 + 10 extra
    expect(dayBudgetForCategory(r, 'day-2', 'Food')).toBe(30) // no extra on day-2
    expect(dayBudgetTotal(r, 'day-1')).toBe(65) // 25 + 40
  })

  it('trip budget = lump + daily allowance × days + all day extras', () => {
    const r = rollup({
      planned_by_category: { Food: 50 }, // whole-trip lump
      daily_by_category: { Stays: 25 }, // per-day allowance
      planned_by_day_category: { 'day-1': { Activities: 40 }, 'day-3': { Activities: 15 } },
    })
    expect(tripBudgetForCategory(r, 5, 'Stays')).toBe(125) // 25 × 5 days
    expect(tripBudgetForCategory(r, 5, 'Food')).toBe(50) // lump only
    expect(tripBudgetForCategory(r, 5, 'Activities')).toBe(55) // 40 + 15 extras
    expect(tripBudgetTotal(r, 5)).toBe(230) // 125 + 50 + 55
  })

  it('a category with only a lump has no day budget (tracked at trip level)', () => {
    const r = rollup({ planned_by_category: { Other: 80 } })
    expect(dayBudgetForCategory(r, 'day-1', 'Other')).toBe(0)
    expect(tripBudgetForCategory(r, 5, 'Other')).toBe(80)
  })
})

describe('patchRollupPlanned (offline budget edits)', () => {
  function line(over: Partial<BudgetLine>): BudgetLine {
    return {
      id: '',
      trip_id: 'trip-1',
      day_id: null,
      category: 'Food',
      planned_amount: 0,
      actual_amount: 0,
      ...over,
    }
  }

  it('returns null when there is no rollup baseline to patch', () => {
    expect(patchRollupPlanned(null, line({ planned_amount: 10 }))).toBeNull()
  })

  it('patches a whole-trip lump and recomposes the budget from it', () => {
    const r = rollup()
    const next = patchRollupPlanned(
      r,
      line({ category: 'Food', scope: 'trip', planned_amount: 60 }),
    )!
    expect(next.planned_by_category.Food).toBe(60)
    expect(tripBudgetForCategory(next, 5, 'Food')).toBe(60)
    // Immutable: the original rollup is untouched.
    expect(r.planned_by_category.Food ?? 0).toBe(0)
  })

  it('patches a per-day allowance so it applies across every day', () => {
    const next = patchRollupPlanned(
      rollup(),
      line({ category: 'Stays', scope: 'daily', planned_amount: 25 }),
    )!
    expect(next.daily_by_category?.Stays).toBe(25)
    expect(tripBudgetForCategory(next, 4, 'Stays')).toBe(100) // 25 × 4 days
  })

  it('patches a single-day extra for the target day only', () => {
    const next = patchRollupPlanned(
      rollup({ planned_by_day_category: { 'day-2': { Activities: 5 } } }),
      line({ category: 'Activities', day_id: 'day-1', planned_amount: 40 }),
    )!
    expect(next.planned_by_day_category?.['day-1']?.Activities).toBe(40)
    expect(dayBudgetForCategory(next, 'day-1', 'Activities')).toBe(40)
    // A different day's existing extra is preserved.
    expect(next.planned_by_day_category?.['day-2']?.Activities).toBe(5)
  })
})
