package budget

import "context"

// ExternalCost is a cost sourced from a stay or plan item, returned by
// TripCostReader. It carries a pre-mapped Category so the budget module never
// imports the trip module.
type ExternalCost struct {
	// DayID is the day this cost belongs to; empty means trip-level (e.g. a
	// stay that spans multiple days and contributes to the whole-trip total).
	DayID    string
	Category Category
	Amount   float64
}

// TripCostReader is the consumer-side interface for reading Stay and PlanItem
// costs from the trip module. The composition root supplies the concrete
// implementation; the budget module never imports trip directly.
type TripCostReader interface {
	GetTripCosts(ctx context.Context, tripID string) ([]ExternalCost, error)
}

// RollupResult holds actual spend aggregated from the three sources
// (stays, plan items, manual cost entries) at three levels, plus the planned
// amounts from budget_lines so the UI can show spent vs. planned vs. remaining
// in a single round-trip.
type RollupResult struct {
	// TripTotal is the sum of all costs across the whole trip.
	TripTotal float64 `json:"trip_total"`
	// ByCategory is the sum per fixed category across the whole trip.
	ByCategory map[string]float64 `json:"by_category"`
	// ByDay is the sum of all costs assigned to each day. Stays are excluded
	// because they span multiple days and are trip-level (DayID == "").
	ByDay map[string]float64 `json:"by_day"`
	// ByCategoryDay is the sum per (day, category); only days with at least one
	// cost appear as keys.
	ByCategoryDay map[string]map[string]float64 `json:"by_day_category"`

	// Planned amounts from budget_lines — zero/absent when no line is set.
	PlannedTripTotal  float64            `json:"planned_trip_total"`
	PlannedByCategory map[string]float64 `json:"planned_by_category"`
	PlannedByDay      map[string]float64 `json:"planned_by_day"`
}

// computeRollup aggregates actual spend from external costs (stays + plan items)
// and manual cost entries into a RollupResult. Costs with an empty DayID
// contribute to TripTotal and ByCategory only (trip-level, e.g. stays).
// lines populates the planned amount fields; pass nil when not needed.
func computeRollup(external []ExternalCost, entries []CostEntry, lines []BudgetLine) RollupResult {
	result := RollupResult{
		ByCategory:        make(map[string]float64),
		ByDay:             make(map[string]float64),
		ByCategoryDay:     make(map[string]map[string]float64),
		PlannedByCategory: make(map[string]float64),
		PlannedByDay:      make(map[string]float64),
	}

	add := func(dayID string, cat Category, amount float64) {
		result.TripTotal += amount
		result.ByCategory[string(cat)] += amount
		if dayID != "" {
			result.ByDay[dayID] += amount
			if result.ByCategoryDay[dayID] == nil {
				result.ByCategoryDay[dayID] = make(map[string]float64)
			}
			result.ByCategoryDay[dayID][string(cat)] += amount
		}
	}

	for _, ec := range external {
		add(ec.DayID, ec.Category, ec.Amount)
	}
	for _, e := range entries {
		add(e.DayID, e.Category, e.Amount)
	}

	for _, bl := range lines {
		if bl.DayID == "" {
			// Trip-level line: contributes to trip total and by-category planned.
			result.PlannedTripTotal += bl.PlannedAmount
			result.PlannedByCategory[string(bl.Category)] += bl.PlannedAmount
		} else {
			// Day-level line: contributes to per-day planned total.
			result.PlannedByDay[bl.DayID] += bl.PlannedAmount
		}
	}

	return result
}
