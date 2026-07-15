import { BUDGET_CATEGORIES, type BudgetCategory, type BudgetRollup } from '../lib/api'

// budgetModel composes the effective budgets from a rollup's raw per-scope
// amounts (whole-trip lumps, per-day allowances, single-day extras). It lives in
// one place so the day view, the trip overview, and the setup screen agree on
// how the three settings combine:
//   day budget[cat]  = daily allowance[cat] + that day's extra[cat]
//   trip budget[cat] = lump[cat] + allowance[cat] × dayCount + Σ day extras[cat]
// A category budgeted only as a whole-trip lump has no day budget (it's tracked
// at the trip level), matching the agreed model.

// dailyAllowance returns the per-day allowance for a category (0 when unset).
export function dailyAllowance(rollup: BudgetRollup, category: string): number {
  return rollup.daily_by_category?.[category] ?? 0
}

// dayExtra returns the single-day extra set for (day, category).
export function dayExtra(rollup: BudgetRollup, dayId: string, category: string): number {
  return rollup.planned_by_day_category?.[dayId]?.[category] ?? 0
}

// dayBudgetForCategory is the budget for a category on a given day: the daily
// allowance plus any extra set for that day.
export function dayBudgetForCategory(
  rollup: BudgetRollup,
  dayId: string,
  category: string,
): number {
  return dailyAllowance(rollup, category) + dayExtra(rollup, dayId, category)
}

// dayBudgetTotal is the whole day's budget across every category.
export function dayBudgetTotal(rollup: BudgetRollup, dayId: string): number {
  return BUDGET_CATEGORIES.reduce((sum, c) => sum + dayBudgetForCategory(rollup, dayId, c), 0)
}

// tripExtrasForCategory sums every day's extra for one category across the trip.
function tripExtrasForCategory(rollup: BudgetRollup, category: string): number {
  const byDay = rollup.planned_by_day_category ?? {}
  let sum = 0
  for (const dayId of Object.keys(byDay)) sum += byDay[dayId]?.[category] ?? 0
  return sum
}

// tripBudgetForCategory is a category's whole-trip budget: the lump, plus the
// daily allowance across every day, plus every single-day extra.
export function tripBudgetForCategory(
  rollup: BudgetRollup,
  dayCount: number,
  category: string,
): number {
  const lump = rollup.planned_by_category?.[category] ?? 0
  return (
    lump + dailyAllowance(rollup, category) * dayCount + tripExtrasForCategory(rollup, category)
  )
}

// tripBudgetTotal is the whole-trip budget across every category.
export function tripBudgetTotal(rollup: BudgetRollup, dayCount: number): number {
  return BUDGET_CATEGORIES.reduce(
    (sum, c: BudgetCategory) => sum + tripBudgetForCategory(rollup, dayCount, c),
    0,
  )
}
