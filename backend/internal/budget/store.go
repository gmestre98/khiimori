package budget

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// budgetStore is the persistence surface for budget lines. The concrete
// pgxBudgetStore implements it; unit tests supply a fake.
type budgetStore interface {
	Upsert(ctx context.Context, line SetBudgetLine) (BudgetLine, error)
}

// pgxBudgetStore is the Postgres-backed budget store.
type pgxBudgetStore struct {
	pool *pgxpool.Pool
}

// Upsert inserts or updates the planned_amount for (trip_id, day_id, category).
// An empty DayID is stored as NULL (trip-level line); NULLS NOT DISTINCT on the
// unique constraint means the ON CONFLICT path fires for trip-level rows too.
func (s *pgxBudgetStore) Upsert(ctx context.Context, line SetBudgetLine) (BudgetLine, error) {
	// NULLIF converts the empty-string DayID sentinel to NULL so NULL goes into
	// day_id for trip-level lines.
	const q = `
		INSERT INTO budget.budget_lines (trip_id, day_id, category, planned_amount)
		VALUES ($1::uuid, NULLIF($2, '')::uuid, $3, $4)
		ON CONFLICT ON CONSTRAINT budget_lines_trip_day_category_unique
		DO UPDATE SET planned_amount = EXCLUDED.planned_amount
		RETURNING id::text, trip_id::text, COALESCE(day_id::text, ''), category,
		          planned_amount, actual_amount`

	var bl BudgetLine
	err := s.pool.QueryRow(ctx, q,
		line.TripID, line.DayID, string(line.Category), line.PlannedAmount,
	).Scan(&bl.ID, &bl.TripID, &bl.DayID, &bl.Category, &bl.PlannedAmount, &bl.ActualAmount)
	if err != nil {
		return BudgetLine{}, fmt.Errorf("budget: upsert: %w", err)
	}
	return bl, nil
}
