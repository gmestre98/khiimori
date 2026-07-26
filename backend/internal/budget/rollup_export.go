package budget

import (
	"context"
	"fmt"
)

// TripRollup computes a trip's full budget rollup — the same aggregation the
// GET /budget/rollup handler returns — exposed so the composition root can build
// the export document's budget summary (M13.3 S4) without re-implementing it.
// Authorization is the caller's responsibility (the export endpoint checks trip
// access before calling).
func (m *Module) TripRollup(ctx context.Context, tripID string) (RollupResult, error) {
	external, err := m.costReader.GetTripCosts(ctx, tripID)
	if err != nil {
		return RollupResult{}, fmt.Errorf("budget: trip costs: %w", err)
	}
	entries, err := m.store.ListCostEntries(ctx, tripID)
	if err != nil {
		return RollupResult{}, fmt.Errorf("budget: cost entries: %w", err)
	}
	lines, err := m.store.ListBudgetLines(ctx, tripID)
	if err != nil {
		return RollupResult{}, fmt.Errorf("budget: budget lines: %w", err)
	}
	return computeRollup(external, entries, lines), nil
}
