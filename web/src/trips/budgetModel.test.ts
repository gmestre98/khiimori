import { describe, expect, it } from 'vitest'
import type { BudgetRollup } from '../lib/api'
import {
  dayBudgetForCategory,
  dayBudgetTotal,
  tripBudgetForCategory,
  tripBudgetTotal,
} from './budgetModel'

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
