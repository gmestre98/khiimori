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
	// Happened marks whether the underlying thing actually occurred: a plan
	// item marked done, or a stay marked paid. When true the cost counts as
	// spent; when false it counts as an upcoming estimate instead (M12.2 S1).
	// The composition-root cost reader is responsible for excluding items that
	// will never happen (skipped/cancelled), so every ExternalCost here is
	// either already-spent or still-expected.
	Happened bool
}

// TripCostReader is the consumer-side interface for reading Stay and PlanItem
// costs from the trip module. The composition root supplies the concrete
// implementation; the budget module never imports trip directly.
type TripCostReader interface {
	GetTripCosts(ctx context.Context, tripID string) ([]ExternalCost, error)
}

// RollupResult holds spend aggregated from the three sources (stays, plan items,
// manual cost entries) at three levels, plus the planned amounts from
// budget_lines so the UI can show spent vs. estimated vs. planned in a single
// round-trip.
//
// "Spent" only counts things that actually happened — a plan item marked done, a
// stay marked paid, and every manual cost entry (which is logged after the fact).
// Costs that haven't happened yet (an idea/planned item, an unpaid stay) are
// surfaced separately as an "estimated" upcoming total so the traveller can tell
// real spend apart from what a plan might still cost (M12.2 S1).
type RollupResult struct {
	// TripTotal is the sum of spent costs across the whole trip.
	TripTotal float64 `json:"trip_total"`
	// ByCategory is the spent sum per fixed category across the whole trip.
	ByCategory map[string]float64 `json:"by_category"`
	// ByDay is the spent sum assigned to each day. Stays are excluded because
	// they span multiple days and are trip-level (DayID == "").
	ByDay map[string]float64 `json:"by_day"`
	// ByCategoryDay is the spent sum per (day, category); only days with at
	// least one spent cost appear as keys.
	ByCategoryDay map[string]map[string]float64 `json:"by_day_category"`

	// Estimated amounts are the not-yet-happened counterparts of the spent
	// fields above: idea/planned items and unpaid stays. Manual cost entries
	// never contribute here.
	EstimatedTripTotal  float64            `json:"estimated_trip_total"`
	EstimatedByCategory map[string]float64 `json:"estimated_by_category"`
	EstimatedByDay      map[string]float64 `json:"estimated_by_day"`

	// Planned amounts from budget_lines — zero/absent when no line is set.
	PlannedTripTotal  float64            `json:"planned_trip_total"`
	PlannedByCategory map[string]float64 `json:"planned_by_category"`
	PlannedByDay      map[string]float64 `json:"planned_by_day"`
}

// computeRollup aggregates spend from external costs (stays + plan items) and
// manual cost entries into a RollupResult. Each external cost lands in the spent
// buckets when it Happened, otherwise in the estimated buckets; manual cost
// entries are always spent. Costs with an empty DayID contribute to the trip and
// category totals only (trip-level, e.g. stays). lines populates the planned
// amount fields; pass nil when not needed.
func computeRollup(external []ExternalCost, entries []CostEntry, lines []BudgetLine) RollupResult {
	result := RollupResult{
		ByCategory:          make(map[string]float64),
		ByDay:               make(map[string]float64),
		ByCategoryDay:       make(map[string]map[string]float64),
		EstimatedByCategory: make(map[string]float64),
		EstimatedByDay:      make(map[string]float64),
		PlannedByCategory:   make(map[string]float64),
		PlannedByDay:        make(map[string]float64),
	}

	addSpent := func(dayID string, cat Category, amount float64) {
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

	addEstimated := func(dayID string, cat Category, amount float64) {
		result.EstimatedTripTotal += amount
		result.EstimatedByCategory[string(cat)] += amount
		if dayID != "" {
			result.EstimatedByDay[dayID] += amount
		}
	}

	for _, ec := range external {
		if ec.Happened {
			addSpent(ec.DayID, ec.Category, ec.Amount)
		} else {
			addEstimated(ec.DayID, ec.Category, ec.Amount)
		}
	}
	for _, e := range entries {
		addSpent(e.DayID, e.Category, e.Amount)
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
